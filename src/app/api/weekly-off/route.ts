import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, parseJson, requireAdmin, requireUser, route } from "@/lib/security/api";
import { weeklyOffInput } from "@/lib/validation";

export const GET = route(async () => {
  await requireUser();
  const rows = await db.weeklyOff.findMany({
    include: { teacher: { select: { id: true, name: true } } },
    orderBy: { teacher: { name: "asc" } },
  });
  return { weeklyOffs: rows.map((r) => ({ id: r.id, day: r.day, teacherId: r.teacherId, teacherName: r.teacher.name })) };
});

/** Set (or clear with day=null) a teacher's weekly off. */
export const PUT = route(async (req: NextRequest) => {
  await requireAdmin();
  const input = await parseJson(req, weeklyOffInput);
  const teacher = await db.teacher.findUnique({ where: { id: input.teacherId } });
  if (!teacher) throw new HttpError(404, "Teacher not found.");
  await db.$transaction(async (tx) => {
    await tx.weeklyOff.deleteMany({ where: { teacherId: input.teacherId } });
    if (input.day) await tx.weeklyOff.create({ data: { teacherId: input.teacherId, day: input.day } });
  });
  return { ok: true };
});
