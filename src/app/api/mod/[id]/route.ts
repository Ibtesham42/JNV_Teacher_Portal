import { db } from "@/lib/db";
import { requireAdmin, route } from "@/lib/security/api";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  await db.modDuty.delete({ where: { id } });
  return { ok: true };
});
