import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storeDocument } from "@/lib/documents";
import { HttpError, requireAdmin, requireUser, route } from "@/lib/security/api";
import { UploadError } from "@/lib/security/files";
import { uploadFields } from "@/lib/validation";
import { visibleDocumentWhere } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

export const GET = route(async () => {
  const user = await requireUser();
  const docs = await db.uploadedDocument.findMany({
    where: user.role === "ADMIN" ? {} : (visibleDocumentWhere as any),
    orderBy: { createdAt: "desc" },
    select: {
      id: true, kind: true, title: true, originalName: true, mimeType: true, sizeBytes: true,
      extractionStatus: true, archived: true, createdAt: true, pageCount: true, ocrUsed: true,
      uploadedBy: { select: { name: true } },
    },
  });
  return { documents: docs };
});

export const POST = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  const fields = uploadFields.safeParse({ kind: form!.get("kind"), title: form!.get("title") || undefined });
  if (!fields.success) throw new HttpError(422, "Choose what kind of document this is.");
  try {
    const doc = await storeDocument({ file, kind: fields.data.kind, title: fields.data.title, userId: admin.id });
    return { document: { id: doc.id, extractionStatus: doc.extractionStatus }, message: "Document uploaded successfully." };
  } catch (e) {
    if (e instanceof UploadError) throw new HttpError(422, e.message);
    throw e;
  }
});
