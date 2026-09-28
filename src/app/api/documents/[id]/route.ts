import { db } from "@/lib/db";
import { HttpError, requireAdmin, route } from "@/lib/security/api";

type Ctx = { params: Promise<{ id: string }> };

/** Archive (hide from teachers). The stored original is never deleted or modified. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const doc = await db.uploadedDocument.findUnique({ where: { id }, include: { routines: { select: { status: true } } } });
  if (!doc) throw new HttpError(404, "Document not found.");
  if (doc.routines.some((r) => r.status === "ACTIVE")) {
    throw new HttpError(409, "This document is the active routine. Publish or activate another routine first.");
  }
  await db.uploadedDocument.update({ where: { id }, data: { archived: true } });
  return { ok: true };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { archived?: boolean; title?: string };
  const data: { archived?: boolean; title?: string } = {};
  if (typeof body.archived === "boolean") data.archived = body.archived;
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 160);
  await db.uploadedDocument.update({ where: { id }, data });
  return { ok: true };
});
