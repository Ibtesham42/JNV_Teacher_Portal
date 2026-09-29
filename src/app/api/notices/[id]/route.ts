import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";
import { noticePatch } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const input = await parseJson(req, noticePatch);
  const before = await db.notice.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Notice not found.");
  const { date, ...rest } = input;
  const notice = await db.notice.update({ where: { id }, data: { ...rest, ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}) } });
  await logActivity(admin, {
    action: input.archived !== undefined ? (input.archived ? "notice.archive" : "notice.restore") : "notice.update",
    entityType: "Notice",
    entityId: id,
    summary: `${input.archived ? "Archived" : input.archived === false ? "Restored" : "Updated"} notice "${before.title}".`,
    oldValue: before,
    newValue: notice,
  });
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const before = await db.notice.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Notice not found.");
  await db.notice.delete({ where: { id } });
  await logActivity(admin, { action: "notice.delete", entityType: "Notice", entityId: id, summary: `Deleted notice "${before.title}".`, oldValue: before });
  return { ok: true };
});
