import path from "node:path";
import JSZip from "jszip";
import { ALLOWED_UPLOADS, config } from "../config";

export type ValidatedUpload = {
  ext: keyof typeof ALLOWED_UPLOADS;
  mime: string;
  kind: "pdf" | "image" | "doc" | "docx";
  safeName: string;
};

const startsWith = (buf: Buffer, sig: number[]) => sig.every((b, i) => buf[i] === b);

export function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*\\/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 150) || "document";
}

export class UploadError extends Error {}

/**
 * Validates an uploaded file by extension, declared size, and *content* (magic bytes),
 * and rejects active content (PDF launch actions, macro-enabled Word files).
 */
export async function validateUpload(name: string, buf: Buffer): Promise<ValidatedUpload> {
  if (buf.length === 0) throw new UploadError("The file is empty.");
  if (buf.length > config.maxUploadBytes)
    throw new UploadError(`File is too large (max ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB).`);

  const ext = path.extname(name).toLowerCase() as keyof typeof ALLOWED_UPLOADS;
  const rule = ALLOWED_UPLOADS[ext];
  if (!rule) throw new UploadError("Unsupported file type. Upload PDF, JPG, PNG, DOC or DOCX.");

  switch (rule.kind) {
    case "pdf": {
      if (!startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw new UploadError("This is not a valid PDF file.");
      const head = buf.toString("latin1");
      if (/\/Launch\b/.test(head) || /\/EmbeddedFile\b/.test(head))
        throw new UploadError("PDFs with embedded files or launch actions are not accepted.");
      break;
    }
    case "image": {
      const png = startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const jpg = startsWith(buf, [0xff, 0xd8, 0xff]);
      if (ext === ".png" ? !png : !jpg) throw new UploadError("The file content does not match its extension.");
      break;
    }
    case "doc": {
      if (!startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
        throw new UploadError("This is not a valid Word (.doc) file.");
      break;
    }
    case "docx": {
      if (!startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) throw new UploadError("This is not a valid Word (.docx) file.");
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(buf);
      } catch {
        throw new UploadError("The .docx file is corrupted.");
      }
      const names = Object.keys(zip.files);
      if (!names.includes("word/document.xml")) throw new UploadError("This is not a valid Word (.docx) file.");
      if (names.some((n) => /vbaProject\.bin$/i.test(n))) throw new UploadError("Macro-enabled documents are not accepted.");
      if (names.length > 2000) throw new UploadError("The .docx file is not valid.");
      break;
    }
  }
  return { ext, mime: rule.mime, kind: rule.kind, safeName: sanitizeFilename(name) };
}
