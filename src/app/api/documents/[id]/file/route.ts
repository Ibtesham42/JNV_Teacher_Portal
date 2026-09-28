import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { HttpError, requireUser, route } from "@/lib/security/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Serves the original, unmodified file. Teachers only see published/stored documents. */
export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const doc = await db.uploadedDocument.findUnique({ where: { id } });
  if (!doc) throw new HttpError(404, "Document not found.");
  if (user.role !== "ADMIN") {
    const visible = !doc.archived && (doc.extractionStatus === "PUBLISHED" || doc.extractionStatus === "NOT_APPLICABLE");
    if (!visible) throw new HttpError(404, "Document not found.");
  }
  const data = await storage.get(doc.storageKey);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const inlineOk = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
  const disposition = download || !inlineOk ? "attachment" : "inline";
  const asciiName = doc.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
});
