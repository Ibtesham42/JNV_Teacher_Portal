import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { GENERATED_MIME } from "../common";
import { db } from "../db";
import { draftDataSchema, type DraftData } from "../extraction/schema";
import { HttpError } from "../security/api";
import { parseTeacherText } from "../teacherIdentity";
import { WEEKDAYS, formatDateShort, isoFromDate, todayISO, dateFromISO } from "../time";
import { getActiveRoutine } from "../queries";
import { addDays, generateRoster, type RosterInput } from "./generate";
import { parseInstructions } from "./instructions";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const rosterParams = z
  .object({
    from: iso,
    to: iso,
    make: z.object({ mod: z.boolean(), holiday: z.boolean(), weeklyOff: z.boolean(), remedial: z.boolean() }),
    workDays: z.array(z.enum(WEEKDAYS)).min(1).max(7),
    holidays: z.array(iso).max(60).default([]),
    modPerDay: z.number().int().min(1).max(5).default(1),
    holidayPerDay: z.number().int().min(1).max(10).default(2),
    minGapDays: z.number().int().min(0).max(7).default(3),
    excludeTeacherIds: z.array(z.string().max(40)).max(500).default([]),
    remedial: z
      .object({
        slots: z.array(z.object({ day: z.enum(WEEKDAYS), start: clock, end: clock })).max(30).default([]),
        perWeek: z.number().int().min(1).max(6).default(2),
        maxPerTeacherPerWeek: z.number().int().min(1).max(10).default(4),
      })
      .default({ slots: [], perWeek: 2, maxPerTeacherPerWeek: 4 }),
    instructions: z.string().max(3000).default(""),
  })
  .refine((p) => p.from <= p.to, { message: "The end date is before the start date." })
  .refine((p) => p.make.mod || p.make.holiday || p.make.weeklyOff || p.make.remedial, { message: "Choose at least one thing to generate." });

export type RosterParams = z.infer<typeof rosterParams>;

/** Real teachers only (no codes or heading text); this is the whole pool the generator can draw from. */
export async function loadRosterTeachers() {
  const all = await db.teacher.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, designation: true } });
  return all.filter((t) => parseTeacherText(t.name).kind === "person");
}

export async function createRosterDraft(params: RosterParams, userId: string): Promise<{ documentId: string; counts: Record<string, number>; warnings: number }> {
  const today = todayISO();
  if (params.to < today) throw new HttpError(422, "The end date is in the past.");
  if (params.from > params.to || (Date.parse(params.to) - Date.parse(params.from)) / 86_400_000 > 366) {
    throw new HttpError(422, "Choose a period of at most one year.");
  }

  const exclude = new Set(params.excludeTeacherIds);
  const teachers = (await loadRosterTeachers()).filter((t) => !exclude.has(t.id));
  if (teachers.length < 2) throw new HttpError(422, "At least two teachers are needed to make a roster.");
  const pool = teachers.map((t) => ({ id: t.id, name: t.name }));

  const ai = await parseInstructions(params.instructions, pool);

  const routine = params.make.remedial || params.make.weeklyOff ? await getActiveRoutine() : null;
  const periods = routine
    ? await db.routinePeriod.findMany({
        where: { routineId: routine.id },
        select: { className: true, section: true, day: true, isBreak: true, subject: true, teacherId: true, startTime: true, endTime: true },
      })
    : [];
  const existingOffs = params.make.weeklyOff ? [] : await db.weeklyOff.findMany({ select: { teacherId: true, day: true } });
  const history = await db.modDuty.findMany({
    where: { date: { gte: dateFromISO(addDays(params.from, -14)), lt: dateFromISO(params.from) } },
    select: { teacherId: true, date: true },
  });

  const input: RosterInput = {
    teachers: pool,
    from: params.from,
    to: params.to,
    workDays: params.workDays,
    holidays: params.holidays,
    make: params.make,
    modPerDay: params.modPerDay,
    holidayPerDay: params.holidayPerDay,
    minGapDays: params.minGapDays,
    restrictions: ai.restrictions,
    preferOff: ai.preferOff,
    existingWeeklyOff: existingOffs,
    history: history.map((h) => ({ teacherId: h.teacherId, date: isoFromDate(h.date) })),
    periods,
    remedial: params.remedial,
  };
  const r = generateRoster(input);

  const nothing = !r.modDuties.length && !r.weeklyOffs.length && !r.remedial.length;
  if (nothing) throw new HttpError(422, r.warnings[0] ?? "Nothing could be generated with these settings.");

  const range = `${formatDateShort(params.from)} - ${formatDateShort(params.to)}`;
  const parts = [params.make.mod && "MOD", params.make.holiday && "Sunday duty", params.make.weeklyOff && "weekly off", params.make.remedial && "remedial"].filter(Boolean).join(", ");
  const title = `Generated roster: ${parts} (${range})`.slice(0, 160);

  const notes = [
    "GENERATED by the roster generator. Check it, change anything you like, and press Publish. Nothing is visible to teachers until you do.",
    ...(ai.understood.length ? ["Instructions applied: " + ai.understood.join(" | ")] : []),
    ...r.warnings.map((w) => `Note: ${w}`),
    ...r.stats.map((s) => `${s.name}: MOD ${s.mod}, Sunday duty ${s.holiday}, remedial ${s.remedial}/week${s.offDay ? `, weekly off ${s.offDay.toLowerCase()}` : ""}${s.compOffs ? `, ${s.compOffs} compensatory off` : ""}`),
    ...ai.warnings.map((w) => `Note: ${w}`),
  ];

  const data: DraftData = draftDataSchema.parse({
    kind: params.make.remedial && !params.make.mod && !params.make.holiday && !params.make.weeklyOff ? "REMEDIAL" : "OTHER",
    title,
    modDuties: r.modDuties,
    weeklyOffs: r.weeklyOffs,
    remedial: r.remedial,
    teacherMap: Object.fromEntries(pool.map((t) => [t.name, t.id])),
    notes,
    generated: { from: params.from, to: params.to, replaceMod: params.make.mod, replaceHoliday: params.make.holiday },
  });

  const doc = await db.uploadedDocument.create({
    data: {
      kind: "OTHER",
      title,
      originalName: "Generated by roster generator",
      mimeType: GENERATED_MIME,
      sizeBytes: 0,
      storageKey: `generated-${randomUUID()}`,
      sha256: "generated",
      extractionStatus: "REVIEW",
      uploadedById: userId,
      draft: {
        create: { status: "REVIEW", stage: "Generated - review", progress: 100, provider: "roster-generator", data: data as unknown as Prisma.InputJsonValue },
      },
    },
    select: { id: true },
  });
  await db.extractionLog.create({
    data: { documentId: doc.id, level: "INFO", stage: "generate", message: `Roster generated (${parts}).`, meta: { duties: r.modDuties.length, weeklyOffs: r.weeklyOffs.length, remedial: r.remedial.length, warnings: r.warnings.length } },
  });
  return { documentId: doc.id, counts: { duties: r.modDuties.length, weeklyOffs: r.weeklyOffs.length, remedial: r.remedial.length }, warnings: r.warnings.length + ai.warnings.length };
}
