import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, parseQuery, route } from "@/lib/security/api";
import { getActiveRoutine, getClassPeriods, getTeacherPeriods, getDayPeriods } from "@/lib/queries";
import { weekdayEnum } from "@/lib/validation";

const query = z.object({
  class: z.string().max(10).optional(),
  section: z.string().max(3).default(""),
  teacherId: z.string().max(40).optional(),
  day: weekdayEnum.optional(),
});

/** Periods of the ACTIVE routine, filtered by class(+section), teacher and/or day. */
export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const q = parseQuery(req, query);
  const routine = await getActiveRoutine();
  if (!routine) return { routine: null, periods: [] };
  let periods: Awaited<ReturnType<typeof getDayPeriods>> = [];
  if (q.teacherId) periods = await getTeacherPeriods(routine.id, q.teacherId, q.day);
  else if (q.class) {
    periods = await getClassPeriods(routine.id, q.class, q.section);
    if (q.day) periods = periods.filter((p) => p.day === q.day);
  } else if (q.day) periods = await getDayPeriods(routine.id, q.day);
  else periods = [];
  return { routine: { id: routine.id, version: routine.version, title: routine.title }, periods };
});
