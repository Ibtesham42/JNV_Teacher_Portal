import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
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
  const admin = await requireAdmin();
  const input = await parseJson(req, weeklyOffInput);
  const teacher = await db.teacher.findUnique({ where: { id: input.teacherId } });
  if (!teacher) throw new HttpError(404, "Teacher not found.");
  const before = await db.weeklyOff.findFirst({ where: { teacherId: input.teacherId } });
  await db.$transaction(async (tx) => {
    await tx.weeklyOff.deleteMany({ where: { teacherId: input.teacherId } });
    if (input.day) await tx.weeklyOff.create({ data: { teacherId: input.teacherId, day: input.day } });
  });
  await logActivity(admin, {
    action: "weeklyoff.set",
    entityType: "WeeklyOff",
    entityId: input.teacherId,
    summary: `Changed weekly off for "${teacher.name}": ${before?.day ?? "none"} -> ${input.day ?? "none"}.`,
    oldValue: { day: before?.day ?? null },
    newValue: { day: input.day },
  });
  return { ok: true };
});
