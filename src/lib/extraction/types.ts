import type { Rules } from "./rules";

export type Word = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0-100. Text-layer words are 100. */
  conf: number;
};

export type PageContent = {
  pageNumber: number;
  width: number;
  height: number;
  words: Word[];
  source: "text-layer" | "ocr" | "structured";
  meanConf: number;
  /** Cell text of Word tables (rows expanded for row-spans); scans get theirs from the detected grid. */
  tables?: { heading: string; rows: string[][] }[];
  /** Ruled table lines found in the scanned image (same coordinates as `words`). */
  rules?: Rules;
  /** PNG/JPEG of the page for the vision model (only for scanned inputs). */
  image?: { data: Buffer; mediaType: "image/png" | "image/jpeg" };
};

export type Line = {
  words: Word[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  yc: number;
  text: string;
};

export type ExtractionContext = {
  log: (level: "INFO" | "WARN" | "ERROR", stage: string, message: string, meta?: unknown) => Promise<void>;
  progress: (stage: string, percent: number) => Promise<void>;
};
