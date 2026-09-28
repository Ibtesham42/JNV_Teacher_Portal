import { cache } from "react";
import type { Weekday } from "@prisma/client";
import { db } from "./db";
import { GENERATED_MIME } from "./common";
import { classRank } from "./extraction/normalize";
import { activateDueRoutines } from "./routineSchedule";
import { dateFromISO, isoFromDate, toMinutes, WEEKDAYS } from "./time";

export const NOT_AVAILABLE = "Information not available in uploaded document.";

export type PeriodRow = {
  id: string;
  className: string;
  section: string;
  day: Weekday;
  slot: number;
  periodNumber: number | null;
  isBreak: boolean;
  label: string | null;
  startTime: string | null;
  endTime: string | null;
  subject: string;
  teacherId: string | null;
  teacherName: string;
};

const periodSelect = {
  id: true,
  className: true,
  section: true,
  day: true,
  slot: true,
  periodNumber: true,
  isBreak: true,
  label: true,
  startTime: true,
  endTime: true,
  subject: true,
  teacherId: true,
  teacherName: true,
  teacher: { select: { name: true } },
} as const;

function toRow(p: any): PeriodRow {
  const { teacher, ...rest } = p;
  return { ...rest, teacherName: teacher?.name ?? p.teacherName };
}

export function classLabel(className: string, section: string): string {
  return section ? `${className}-${section}` : className;
}

export function sortClassKeys<T extends { className: string; section: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => classRank(a.className) - classRank(b.className) || a.section.localeCompare(b.section));
}

// ------------------------------------------------------------------ routine

export const getActiveRoutine = cache(async () => {
  await activateDueRoutines();
  return db.routine.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { version: "desc" },
    include: { document: { select: { id: true, originalName: true, mimeType: true } } },
  });
});

export async function getRoutineClasses(routineId: string) {
  const rows = await db.routineClass.findMany({ where: { routineId } });
  return sortClassKeys(rows);
}

export async function getClassPeriods(routineId: string, className: string, section: string): Promise<PeriodRow[]> {
  const rows = await db.routinePeriod.findMany({
    where: { routineId, className, section },
    select: periodSelect,
  });
  return rows.map(toRow);
}

export async function getDayPeriods(routineId: string, day: Weekday, className?: string): Promise<PeriodRow[]> {
  const rows = await db.routinePeriod.findMany({
    where: { routineId, day, ...(className ? { className } : {}) },
    select: periodSelect,
  });
  return rows.map(toRow);
}

export async function getAllPeriods(routineId: string): Promise<PeriodRow[]> {
  const rows = await db.routinePeriod.findMany({ where: { routineId }, select: periodSelect });
  return rows.map(toRow);
}

export async function getTeacherPeriods(routineId: string, teacherId: string, day?: Weekday): Promise<PeriodRow[]> {
  const rows = await db.routinePeriod.findMany({
    where: { routineId, teacherId, isBreak: false, ...(day ? { day } : {}) },
    select: periodSelect,
  });
  return rows.map(toRow).sort(byTime);
}

export function byTime(a: PeriodRow, b: PeriodRow): number {
  const ta = toMinutes(a.startTime);
  const tb = toMinutes(b.startTime);
  if (ta != null && tb != null && ta !== tb) return ta - tb;
  return a.slot - b.slot;
}

/** Days of the week that actually have periods, in calendar order. */
export function workingDays(periods: { day: string }[]): Weekday[] {
  const set = new Set(periods.map((p) => p.day));
  return WEEKDAYS.filter((d) => set.has(d)) as Weekday[];
}

// ------------------------------------------------------------------ teachers

export const teacherSelect = { id: true, name: true, code: true, designation: true, active: true } as const;

export async function getTeacher(id: string) {
  return db.teacher.findUnique({ where: { id }, include: { weeklyOffs: true } });
}

export async function searchTeachers(q: string, limit = 12) {
  const term = q.trim();
  if (!term) return [];
  return db.teacher.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { code: { contains: term, mode: "insensitive" } },
        { aliases: { has: term } },
      ],
    },
    select: teacherSelect,
    orderBy: { name: "asc" },
    take: limit,
  });
}

// ------------------------------------------------------------------ MOD / weekly off

export async function getModForDate(iso: string) {
  return db.modDuty.findMany({ where: { date: dateFromISO(iso), dutyType: "MOD" }, orderBy: { teacherName: "asc" } });
}

/** Sunday / holiday duty (house, supervised study) - separate from MOD. */
export async function getHolidayDutyForDate(iso: string) {
  return db.modDuty.findMany({ where: { date: dateFromISO(iso), dutyType: "HOLIDAY" }, orderBy: [{ house: "asc" }, { teacherName: "asc" }] });
}

export async function getUpcomingMod(fromISO: string, limit = 60, dutyType: "MOD" | "HOLIDAY" = "MOD") {
  const rows = await db.modDuty.findMany({
    where: { date: { gte: dateFromISO(fromISO) }, dutyType },
    orderBy: [{ date: "asc" }, { teacherName: "asc" }],
    take: limit,
  });
  return rows.map((r) => ({ ...r, iso: isoFromDate(r.date) }));
}

export async function getWeeklyOffs() {
  return db.weeklyOff.findMany({
    include: { teacher: { select: { id: true, name: true, active: true } } },
    orderBy: { teacher: { name: "asc" } },
  });
}

export async function getWeeklyOffByDay() {
  const rows = (await getWeeklyOffs()).filter((r) => r.teacher.active);
  const map = new Map<Weekday, { id: string; name: string }[]>();
  for (const r of rows) {
    map.set(r.day, [...(map.get(r.day) ?? []), { id: r.teacher.id, name: r.teacher.name }]);
  }
  return map;
}

// ------------------------------------------------------------------ documents / notices / etc.

export const visibleDocumentWhere = {
  archived: false,
  // rosters made by the generator have no file to show
  mimeType: { not: GENERATED_MIME },
  extractionStatus: { in: ["PUBLISHED", "NOT_APPLICABLE"] },
} as const;

export async function getOfficialDocuments() {
  const docs = await db.uploadedDocument.findMany({
    where: visibleDocumentWhere as any,
    orderBy: { createdAt: "desc" },
    include: { routines: { select: { id: true, status: true, version: true } } },
  });
  return docs;
}

export async function getLatestNotices(limit = 5) {
  const rows = await db.notice.findMany({
    where: { archived: false },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  const weight = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
  return rows
    .sort((a, b) => weight[a.priority] - weight[b.priority] || b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}

export async function getRemedial() {
  const rows = await db.remedialSchedule.findMany({
    where: { active: true },
    include: { teacher: { select: { name: true } } },
  });
  return rows
    .map((r) => ({ ...r, teacherName: r.teacher?.name ?? r.teacherName }))
    .sort(
      (a, b) =>
        classRank(a.className) - classRank(b.className) ||
        a.section.localeCompare(b.section) ||
        WEEKDAYS.indexOf((a.day ?? "SUNDAY") as any) - WEEKDAYS.indexOf((b.day ?? "SUNDAY") as any) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    );
}

export async function getClubs() {
  return db.clubActivity.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function getDashboardCounts() {
  const [teachers, documents, pending, published] = await Promise.all([
    db.teacher.count({ where: { active: true } }),
    db.uploadedDocument.count({ where: { archived: false } }),
    db.uploadedDocument.count({ where: { extractionStatus: { in: ["REVIEW", "PROCESSING", "QUEUED", "FAILED"] }, archived: false } }),
    db.routine.count(),
  ]);
  return { teachers, documents, pending, published };
}

// ------------------------------------------------------------------ dated weekly offs
// A Sunday / holiday duty list prints a compensatory weekly-off DATE next to each duty teacher.

export type DatedOff = { id: string; teacherId: string; teacherName: string; offISO: string; dutyISO: string; house: string | null };

export async function getDatedWeeklyOffs(fromISO: string): Promise<DatedOff[]> {
  const rows = await db.modDuty.findMany({
    where: { dutyType: "HOLIDAY", offDate: { gte: dateFromISO(fromISO) } },
    orderBy: [{ offDate: "asc" }, { teacherName: "asc" }],
    take: 500,
  });
  return rows.map((r) => ({ id: r.id, teacherId: r.teacherId, teacherName: r.teacherName, offISO: isoFromDate(r.offDate!), dutyISO: isoFromDate(r.date), house: r.house }));
}
