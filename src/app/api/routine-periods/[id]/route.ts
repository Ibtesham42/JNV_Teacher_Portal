import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";
import { toMinutes } from "@/lib/time";
import { periodPatch } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Quick correction of a single published period (admin only). */
export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await parseJson(req, periodPatch);
  const current = await db.routinePeriod.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, "Period not found.");
  const start = input.startTime !== undefined ? input.startTime : current.startTime;
  const end = input.endTime !== undefined ? input.endTime : current.endTime;
  if (start && end && toMinutes(end)! <= toMinutes(start)!) throw new HttpError(422, "End time must be after start time.");

  const data: Record<string, unknown> = {};
  if (input.subject !== undefined) data.subject = input.subject;
  if (input.startTime !== undefined) data.startTime = input.startTime;
  if (input.endTime !== undefined) data.endTime = input.endTime;
  if (input.room !== undefined) data.room = input.room;
  if (input.teacherId !== undefined) {
    if (input.teacherId) {
      const t = await db.teacher.findUnique({ where: { id: input.teacherId } });
      if (!t) throw new HttpError(422, "Teacher not found.");
      data.teacherId = t.id;
      data.teacherName = t.name;
    } else {
      data.teacherId = null;
      data.teacherName = "";
    }
  }
  const period = await db.routinePeriod.update({ where: { id }, data });
  return { period };
});
