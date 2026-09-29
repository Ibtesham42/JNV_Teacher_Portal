import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { deleteDocuments } from "@/lib/storageCleanup";
import { HttpError, requireAdmin, route } from "@/lib/security/api";

type Ctx = { params: Promise<{ id: string }> };

/** Archive (hide from teachers, file kept). With ?permanent=1 the document and its stored file are deleted for good - refused while it is in use. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  if (new URL(req.url).searchParams.get("permanent") === "1") {
    const doc = await db.uploadedDocument.findUnique({ where: { id } });
    const r = await deleteDocuments([id]);
    if (r.skipped.length) throw new HttpError(409, r.skipped[0].why);
    if (doc) await logActivity(admin, { action: "document.delete", entityType: "Document", entityId: id, summary: `Permanently deleted document "${doc.title}".`, oldValue: doc });
    return { ok: true };
  }
  const doc = await db.uploadedDocument.findUnique({ where: { id }, include: { routines: { select: { status: true } } } });
  if (!doc) throw new HttpError(404, "Document not found.");
  if (doc.routines.some((r) => r.status === "ACTIVE")) {
    throw new HttpError(409, "This document is the active routine. Publish or activate another routine first.");
  }
  await db.uploadedDocument.update({ where: { id }, data: { archived: true } });
  await logActivity(admin, { action: "document.archive", entityType: "Document", entityId: id, summary: `Archived document "${doc.title}".` });
  return { ok: true };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const before = await db.uploadedDocument.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Document not found.");
  const body = (await req.json().catch(() => ({}))) as { archived?: boolean; title?: string };
  const data: { archived?: boolean; title?: string } = {};
  if (typeof body.archived === "boolean") data.archived = body.archived;
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 160);
  await db.uploadedDocument.update({ where: { id }, data });
  if (data.archived === false) await logActivity(admin, { action: "document.restore", entityType: "Document", entityId: id, summary: `Restored document "${before.title}".` });
  return { ok: true };
});
