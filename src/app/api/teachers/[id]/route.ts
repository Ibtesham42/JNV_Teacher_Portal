import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";
import { teacherPatch } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const data = await parseJson(req, teacherPatch);
  const before = await db.teacher.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Teacher not found.");
  const teacher = await db.teacher.update({ where: { id }, data });
  if (data.active === false) await db.user.updateMany({ where: { teacherId: id }, data: { active: false } });
  await logActivity(admin, {
    action: "teacher.update",
    entityType: "Teacher",
    entityId: id,
    summary: `Updated teacher "${before.name}".`,
    oldValue: before,
    newValue: teacher,
  });
  return { teacher };
});

/** Deactivates (history in old routines is kept). Use ?hard=1 only for teachers with no records. */
export const DELETE = route<Ctx>(async (req: NextRequest, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const before = await db.teacher.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Teacher not found.");
  if (req.nextUrl.searchParams.get("hard") === "1") {
    const [periods, mod] = await Promise.all([db.routinePeriod.count({ where: { teacherId: id } }), db.modDuty.count({ where: { teacherId: id } })]);
    if (periods || mod) throw new HttpError(409, "This teacher appears in routines or MOD records. Deactivate instead.");
    await db.user.deleteMany({ where: { teacherId: id } });
    await db.teacher.delete({ where: { id } });
    await logActivity(admin, { action: "teacher.delete", entityType: "Teacher", entityId: id, summary: `Permanently deleted teacher "${before.name}".`, oldValue: before });
    return { ok: true };
  }
  await db.teacher.update({ where: { id }, data: { active: false } });
  await db.user.updateMany({ where: { teacherId: id }, data: { active: false } });
  await logActivity(admin, { action: "teacher.deactivate", entityType: "Teacher", entityId: id, summary: `Deactivated teacher "${before.name}".`, oldValue: before });
  return { ok: true };
});
