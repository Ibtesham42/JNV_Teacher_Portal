import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";
import { teacherPatch } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const data = await parseJson(req, teacherPatch);
  const teacher = await db.teacher.update({ where: { id }, data });
  if (data.active === false) await db.user.updateMany({ where: { teacherId: id }, data: { active: false } });
  return { teacher };
});

/** Deactivates (history in old routines is kept). Use ?hard=1 only for teachers with no records. */
export const DELETE = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  const { id } = await params;
  if (req.nextUrl.searchParams.get("hard") === "1") {
    const [periods, mod] = await Promise.all([db.routinePeriod.count({ where: { teacherId: id } }), db.modDuty.count({ where: { teacherId: id } })]);
    if (periods || mod) throw new HttpError(409, "This teacher appears in routines or MOD records. Deactivate instead.");
    await db.user.deleteMany({ where: { teacherId: id } });
    await db.teacher.delete({ where: { id } });
    return { ok: true };
  }
  await db.teacher.update({ where: { id }, data: { active: false } });
  await db.user.updateMany({ where: { teacherId: id }, data: { active: false } });
  return { ok: true };
});
