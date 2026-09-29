import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";
import { subjectInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const input = await parseJson(req, subjectInput);
  const before = await db.subject.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Subject not found.");
  const dupe = await db.subject.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" } } });
  if (dupe) throw new HttpError(409, "That subject already exists.");
  const subject = await db.subject.update({ where: { id }, data: { name: input.name } });
  await logActivity(admin, {
    action: "subject.update",
    entityType: "Subject",
    entityId: id,
    summary: `Renamed subject "${before.name}" to "${subject.name}".`,
    oldValue: before,
    newValue: subject,
  });
  return { subject };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const subject = await db.subject.findUnique({ where: { id } });
  if (!subject) throw new HttpError(404, "Subject not found.");
  const uses = await db.routinePeriod.count({ where: { subjectId: id } });
  if (uses > 0) throw new HttpError(409, `"${subject.name}" is used in ${uses} routine period(s) and cannot be deleted.`);
  await db.subject.delete({ where: { id } });
  await logActivity(admin, { action: "subject.delete", entityType: "Subject", entityId: id, summary: `Deleted subject "${subject.name}".`, oldValue: subject });
  return { ok: true };
});
