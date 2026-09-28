import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { draftDataSchema } from "@/lib/extraction/schema";
import { failStaleExtractions } from "@/lib/extraction/pipeline";
import { loadTeachers } from "@/lib/extraction/publish";
import { validateDraft } from "@/lib/extraction/validate";
import { HttpError, requireAdmin, route } from "@/lib/security/api";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  await failStaleExtractions();
  const doc = await db.uploadedDocument.findUnique({
    where: { id },
    include: { draft: true, uploadedBy: { select: { name: true } } },
  });
  if (!doc || !doc.draft) throw new HttpError(404, "No extraction found for this document.");
  const logs = await db.extractionLog.findMany({ where: { documentId: id }, orderBy: { createdAt: "asc" }, take: 300 });

  const { data: raw, rawText, ...draftMeta } = doc.draft;
  let data = null;
  let validation = null;
  if (raw && (doc.draft.status === "REVIEW" || doc.draft.status === "PUBLISHED")) {
    data = draftDataSchema.parse(raw);
    validation = validateDraft(data, await loadTeachers());
  }
  return {
    document: {
      id: doc.id, kind: doc.kind, title: doc.title, originalName: doc.originalName, mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes, pageCount: doc.pageCount, ocrUsed: doc.ocrUsed, createdAt: doc.createdAt,
      uploadedBy: doc.uploadedBy?.name ?? null, extractionStatus: doc.extractionStatus,
    },
    draft: { ...draftMeta, hasRawText: !!rawText },
    data,
    validation,
    logs,
  };
});

const putBody = z.object({ data: draftDataSchema });

/** SAVE DRAFT - stores the admin's edits (nothing becomes visible to teachers). */
export const PUT = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const draft = await db.extractionDraft.findUnique({ where: { documentId: id } });
  if (!draft) throw new HttpError(404, "No extraction found for this document.");
  // a FAILED extraction can be continued by entering the data manually
  if (draft.status !== "REVIEW" && draft.status !== "FAILED") throw new HttpError(409, "This extraction can no longer be edited.");
  const parsed = putBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new HttpError(422, "The edited data is not valid.", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  await db.extractionDraft.update({
    where: { documentId: id },
    data: { data: parsed.data.data as unknown as Prisma.InputJsonValue, status: "REVIEW", stage: "Review", errorMessage: null },
  });
  if (draft.status === "FAILED") await db.uploadedDocument.update({ where: { id }, data: { extractionStatus: "REVIEW" } });
  const validation = validateDraft(parsed.data.data, await loadTeachers());
  return { ok: true, validation };
});
