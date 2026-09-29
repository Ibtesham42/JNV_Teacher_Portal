import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { HttpError, parseJson, requireAdmin, requireUser, route } from "@/lib/security/api";
import { dateFromISO, isoFromDate, todayISO, weekdayOfISO } from "@/lib/time";
import { modInput } from "@/lib/validation";

export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const from = req.nextUrl.searchParams.get("from") || todayISO();
  const to = req.nextUrl.searchParams.get("to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw new HttpError(422, "Invalid date.");
  const rows = await db.modDuty.findMany({
    where: { date: { gte: dateFromISO(from), ...(to ? { lte: dateFromISO(to) } : {}) } },
    orderBy: [{ date: "asc" }, { teacherName: "asc" }],
    take: 500,
  });
  return { duties: rows.map((r) => ({ id: r.id, date: isoFromDate(r.date), day: r.day, dutyType: r.dutyType, teacherId: r.teacherId, teacherName: r.teacherName, dutyDescription: r.dutyDescription, house: r.house, classes: r.classes })) };
});

/** Assign one or more teachers as MOD on one or more dates. */
export const POST = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const input = await parseJson(req, modInput);
  const teachers = await db.teacher.findMany({ where: { id: { in: input.teacherIds }, active: true } });
  if (teachers.length !== new Set(input.teacherIds).size) throw new HttpError(422, "One of the teachers was not found.");
  const dates = [...new Set(input.dates)];
  const before = await db.modDuty.findMany({
    where: { date: { in: dates.map(dateFromISO) }, teacherId: { in: teachers.map((t) => t.id) }, dutyType: input.dutyType },
  });
  let count = 0;
  for (const date of dates) {
    for (const t of teachers) {
      await db.modDuty.upsert({
        where: { date_teacherId_dutyType: { date: dateFromISO(date), teacherId: t.id, dutyType: input.dutyType } },
        update: { dutyDescription: input.dutyDescription, teacherName: t.name },
        create: { date: dateFromISO(date), day: weekdayOfISO(date), teacherId: t.id, teacherName: t.name, dutyDescription: input.dutyDescription, dutyType: input.dutyType },
      });
      count++;
    }
  }
  await logActivity(admin, {
    action: "mod.assign",
    entityType: "ModDuty",
    summary: `Assigned ${input.dutyType === "HOLIDAY" ? "Sunday/holiday duty" : "MOD duty"} to ${teachers.map((t) => t.name).join(", ")} on ${dates.join(", ")}.`,
    oldValue: before.map((m) => ({ date: isoFromDate(m.date), teacherName: m.teacherName })),
    newValue: { dates, teachers: teachers.map((t) => t.name), dutyDescription: input.dutyDescription },
  });
  return { ok: true, count };
});
