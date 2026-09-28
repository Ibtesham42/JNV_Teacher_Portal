import path from "node:path";

function list(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export const config = {
  schoolName: "JAWAHAR NAVODAYA VIDYALAYA",
  schoolAddress: "RYMBAI, EAST JAINTIA HILLS, MEGHALAYA",
  portalName: "Teacher Routine Portal",
  timezone: process.env.SCHOOL_TZ || "Asia/Kolkata",
  /** Classes the school runs (used for validation and the class picker). */
  classes: list(process.env.SCHOOL_CLASSES, ["VI", "VII", "VIII", "IX", "X", "XI", "XII"]),
  sections: list(process.env.SCHOOL_SECTIONS, ["A", "B", "C", "D", "E", "F"]),
  maxPeriodNumber: 12,
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
