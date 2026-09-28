import { db } from "@/lib/db";
import { HttpError, requireAdmin, route } from "@/lib/security/api";

type Ctx = { params: Promise<{ id: string }> };

/** CANCEL - discards the draft. The uploaded original is kept for the admin's records. */
export const POST = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const draft = await db.extractionDraft.findUnique({ where: { documentId: id } });
  if (!draft) throw new HttpError(404, "No extraction found for this document.");
  if (draft.status === "PUBLISHED") throw new HttpError(409, "Already published.");
  await db.extractionDraft.update({ where: { documentId: id }, data: { status: "CANCELLED", stage: "Cancelled" } });
  await db.uploadedDocument.update({ where: { id }, data: { extractionStatus: "CANCELLED" } });
  await db.extractionLog.create({ data: { documentId: id, level: "INFO", stage: "review", message: "Cancelled by admin." } });
  return { ok: true };
});
