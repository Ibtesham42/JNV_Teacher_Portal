import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseJson, requireAdmin, route } from "@/lib/security/api";
import { noticePatch } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await parseJson(req, noticePatch);
  const { date, ...rest } = input;
  await db.notice.update({ where: { id }, data: { ...rest, ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}) } });
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  await db.notice.delete({ where: { id } });
  return { ok: true };
});
