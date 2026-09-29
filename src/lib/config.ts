import path from "node:path";

/** School identity (name, address, portal title, exam sheet URL, classes, sections) lives in
 *  the SchoolSettings table now - see src/lib/settings.ts::getSchoolSettings(). It's editable
 *  from Admin -> School Settings without a code change or redeploy. */
export const config = {
  timezone: process.env.SCHOOL_TZ || "Asia/Kolkata",
  maxPeriodNumber: 12,
  /** Vercel rejects request bodies over ~4.5 MB, so set MAX_UPLOAD_MB=4 there. */
  maxUploadBytes: Math.max(1, Number(process.env.MAX_UPLOAD_MB || 25)) * 1024 * 1024,
  storageDir: path.resolve(process.env.STORAGE_DIR || "./.data/uploads"),
  tessDataDir: path.resolve(process.env.TESSDATA_DIR || "./.data/tessdata"),
  ocrLang: process.env.OCR_LANG || "eng",
  /** Max PDF pages that are rendered + OCR'd. */
  maxPages: Math.max(1, Number(process.env.MAX_EXTRACT_PAGES || 30)),
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  },
  lowConfidence: 0.75,
} as const;

export const ALLOWED_UPLOADS = {
  ".pdf": { mime: "application/pdf", kind: "pdf" },
  ".jpg": { mime: "image/jpeg", kind: "image" },
  ".jpeg": { mime: "image/jpeg", kind: "image" },
  ".png": { mime: "image/png", kind: "image" },
  ".doc": { mime: "application/msword", kind: "doc" },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
  },
} as const;
