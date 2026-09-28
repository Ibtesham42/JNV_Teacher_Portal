import type { DraftData, Issue, ValidationResult } from "@/lib/extraction/schema";

export type { DraftData, Issue, ValidationResult };

export type TeacherOption = { id: string; name: string; code: string | null };

export type ReviewResponse = {
  document: {
    id: string;
    kind: "ROUTINE" | "REMEDIAL" | "CLUB" | "NOTICE" | "OTHER";
    title: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    pageCount: number | null;
    ocrUsed: boolean;
    createdAt: string;
    uploadedBy: string | null;
    extractionStatus: string;
  };
  draft: {
    status: "QUEUED" | "PROCESSING" | "REVIEW" | "FAILED" | "PUBLISHED" | "CANCELLED";
    stage: string;
    progress: number;
    provider: string | null;
    errorMessage: string | null;
    ocrConfidence: number | null;
    hasRawText: boolean;
  };
  data: DraftData | null;
  validation: ValidationResult | null;
  logs: { id: string; level: "INFO" | "WARN" | "ERROR"; stage: string; message: string; createdAt: string }[];
};

export type ItemIssues = Map<string, Issue[]>;

export function groupIssues(v: ValidationResult | null): ItemIssues {
  const m: ItemIssues = new Map();
  for (const i of v?.issues ?? []) {
    if (!i.itemId) continue;
    m.set(i.itemId, [...(m.get(i.itemId) ?? []), i]);
  }
  return m;
}
