import crypto from "node:crypto";
import path from "node:path";
import type { DocumentKind } from "@prisma/client";
import { db } from "./db";
import { storage } from "./storage";
import { enqueueExtraction } from "./extraction/pipeline";
import { validateUpload } from "./security/files";

const EXTRACTABLE: DocumentKind[] = ["ROUTINE", "REMEDIAL", "CLUB"];

/** Validates, stores (never modifies) and registers an uploaded original. */
export async function storeDocument(opts: {
  file: File;
  kind: DocumentKind;
  title?: string;
  userId: string;
  extract?: boolean;
}) {
  const buf = Buffer.from(await opts.file.arrayBuffer());
  const v = await validateUpload(opts.file.name, buf);
  const storageKey = `${crypto.randomUUID()}${v.ext === ".jpeg" ? ".jpg" : v.ext}`;
  await storage.put(storageKey, buf);

  const shouldExtract = (opts.extract ?? true) && EXTRACTABLE.includes(opts.kind);
  const title = (opts.title?.trim() || path.basename(v.safeName, path.extname(v.safeName))).slice(0, 160);
  const doc = await db.uploadedDocument.create({
    data: {
      kind: opts.kind,
      title,
      originalName: v.safeName,
      mimeType: v.mime,
      sizeBytes: buf.length,
      storageKey,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      uploadedById: opts.userId,
      extractionStatus: shouldExtract ? "QUEUED" : "NOT_APPLICABLE",
      ...(shouldExtract ? { draft: { create: { status: "QUEUED", stage: "Queued", progress: 0 } } } : {}),
    },
  });
  await db.extractionLog.create({
    data: { documentId: doc.id, level: "INFO", stage: "upload", message: `Uploaded ${v.safeName} (${buf.length} bytes).` },
  });
  if (shouldExtract) enqueueExtraction(doc.id);
  return doc;
}
