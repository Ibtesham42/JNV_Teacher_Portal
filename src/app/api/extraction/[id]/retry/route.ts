import { db } from "@/lib/db";
import { enqueueExtraction } from "@/lib/extraction/pipeline";
import { HttpError, requireAdmin, route } from "@/lib/security/api";

type Ctx = { params: Promise<{ id: string }> };

/** Re-run OCR/extraction on the stored original (replaces the unpublished draft). */
export const POST = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const doc = await db.uploadedDocument.findUnique({ where: { id }, include: { draft: true } });
  if (!doc) throw new HttpError(404, "Document not found.");
  if (!["ROUTINE", "REMEDIAL", "CLUB"].includes(doc.kind)) throw new HttpError(409, "This document type is not extracted.");
  if (doc.draft?.status === "PUBLISHED") throw new HttpError(409, "Already published.");
  if (doc.draft?.status === "PROCESSING") throw new HttpError(409, "Extraction is already running.");
  await db.extractionDraft.upsert({
    where: { documentId: id },
    update: { status: "QUEUED", stage: "Queued", progress: 0, errorMessage: null, data: undefined },
    create: { documentId: id, status: "QUEUED", stage: "Queued", progress: 0 },
  });
  await db.uploadedDocument.update({ where: { id }, data: { extractionStatus: "QUEUED" } });
  await db.extractionLog.create({ data: { documentId: id, level: "INFO", stage: "retry", message: "Extraction restarted by admin." } });
  enqueueExtraction(id);
  return { ok: true };
});
