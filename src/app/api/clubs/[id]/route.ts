import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseJson, requireAdmin, route } from "@/lib/security/api";
import { clubInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await parseJson(req, clubInput.partial());
  await db.clubActivity.update({ where: { id }, data: input });
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  await db.clubActivity.delete({ where: { id } });
  return { ok: true };
});
