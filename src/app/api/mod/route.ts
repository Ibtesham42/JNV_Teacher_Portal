import { NextRequest } from "next/server";
import { db } from "@/lib/db";
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
  await requireAdmin();
  const input = await parseJson(req, modInput);
  const teachers = await db.teacher.findMany({ where: { id: { in: input.teacherIds }, active: true } });
  if (teachers.length !== new Set(input.teacherIds).size) throw new HttpError(422, "One of the teachers was not found.");
  let count = 0;
  for (const date of new Set(input.dates)) {
    for (const t of teachers) {
      await db.modDuty.upsert({
        where: { date_teacherId_dutyType: { date: dateFromISO(date), teacherId: t.id, dutyType: input.dutyType } },
        update: { dutyDescription: input.dutyDescription, teacherName: t.name },
        create: { date: dateFromISO(date), day: weekdayOfISO(date), teacherId: t.id, teacherName: t.name, dutyDescription: input.dutyDescription, dutyType: input.dutyType },
      });
      count++;
    }
  }
  return { ok: true, count };
});
