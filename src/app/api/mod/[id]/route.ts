import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { HttpError, requireAdmin, route } from "@/lib/security/api";
import { isoFromDate } from "@/lib/time";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const before = await db.modDuty.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Duty not found.");
  await db.modDuty.delete({ where: { id } });
  await logActivity(admin, {
    action: "mod.delete",
    entityType: "ModDuty",
    entityId: id,
    summary: `Removed ${before.dutyType === "HOLIDAY" ? "Sunday/holiday duty" : "MOD duty"} for "${before.teacherName}" on ${isoFromDate(before.date)}.`,
    oldValue: before,
  });
  return { ok: true };
});
