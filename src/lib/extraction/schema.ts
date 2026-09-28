import { z } from "zod";
import { WEEKDAYS } from "../time";

export const weekdaySchema = z.enum(WEEKDAYS);
export const categorySchema = z.enum(["REMEDIAL", "LIFE_SKILL", "ENRICHMENT", "OTHER"]);
export const draftKindSchema = z.enum(["ROUTINE", "REMEDIAL", "CLUB", "OTHER"]);

const conf = z.number().min(0).max(1).nullable().default(null);

export const extractedPeriodSchema = z.object({
  id: z.string().min(1),
  className: z.string().trim().max(10),
  section: z.string().trim().max(3).default(""),
  day: weekdaySchema,
  /** Column position inside the day, breaks included. */
  slot: z.number().int().min(0).max(40),
  periodNumber: z.number().int().min(0).max(40).nullable(),
  isBreak: z.boolean().default(false),
  label: z.string().trim().max(40).nullable().default(null),
  startTime: z.string().nullable().default(null),
  endTime: z.string().nullable().default(null),
  subject: z.string().trim().max(120).default(""),
  teacherName: z.string().trim().max(160).default(""),
  room: z.string().trim().max(40).nullable().default(null),
  /** null = entered by hand (no OCR confidence). */
  confidence: conf,
});
export type ExtractedPeriod = z.infer<typeof extractedPeriodSchema>;

export const extractedModSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teacherName: z.string().trim().max(160),
  description: z.string().trim().max(300).default(""),
  /** MOD (master on duty) or Sunday / holiday duty */
  dutyType: z.enum(["MOD", "HOLIDAY"]).default("MOD"),
  /** teacher code or designation printed next to the name (TGT-Maths, Staff Nurse) */
  designation: z.string().trim().max(80).nullable().default(null),
  house: z.string().trim().max(80).nullable().default(null),
  classes: z.string().trim().max(80).nullable().default(null),
  /** compensatory weekly-off date printed next to a holiday duty */
  offDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  confidence: conf,
});
export type ExtractedMod = z.infer<typeof extractedModSchema>;

export const extractedWeeklyOffSchema = z.object({
  id: z.string().min(1),
  day: weekdaySchema,
  teacherName: z.string().trim().max(160),
  confidence: conf,
});
export type ExtractedWeeklyOff = z.infer<typeof extractedWeeklyOffSchema>;

export const extractedRemedialSchema = z.object({
  id: z.string().min(1),
  category: categorySchema.default("REMEDIAL"),
  className: z.string().trim().max(10),
  section: z.string().trim().max(3).default(""),
  day: weekdaySchema.nullable().default(null),
  startTime: z.string().nullable().default(null),
  endTime: z.string().nullable().default(null),
  activity: z.string().trim().max(200).default(""),
  teacherName: z.string().trim().max(160).default(""),
  confidence: conf,
});
export type ExtractedRemedial = z.infer<typeof extractedRemedialSchema>;

export const extractedClubSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  teachers: z.array(z.string().trim().max(160)).max(60).default([]),
  activities: z.array(z.string().trim().max(300)).max(60).default([]),
  confidence: conf,
});
export type ExtractedClub = z.infer<typeof extractedClubSchema>;

export const draftDataSchema = z.object({
  kind: draftKindSchema.default("ROUTINE"),
  session: z.string().trim().max(40).nullable().default(null),
  title: z.string().trim().max(160).default(""),
  periods: z.array(extractedPeriodSchema).max(6000).default([]),
  modDuties: z.array(extractedModSchema).max(2000).default([]),
  weeklyOffs: z.array(extractedWeeklyOffSchema).max(500).default([]),
  remedial: z.array(extractedRemedialSchema).max(2000).default([]),
  clubs: z.array(extractedClubSchema).max(200).default([]),
  /** raw teacher text -> Teacher.id | "NEW" (create on publish) */
  teacherMap: z.record(z.string(), z.string()).default({}),
  /** free-form notes from the extractor (never edited by hand) */
  notes: z.array(z.string()).default([]),
});
export type DraftData = z.infer<typeof draftDataSchema>;

export function emptyDraft(kind: DraftData["kind"] = "ROUTINE"): DraftData {
  return draftDataSchema.parse({ kind });
}

// ---------------------------------------------------------------- validation output

export type IssueSeverity = "error" | "warning";
export type Issue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** which list the item belongs to + the item id */
  scope: "period" | "mod" | "weeklyOff" | "remedial" | "club" | "general";
  itemId?: string;
};

export type ValidationResult = {
  issues: Issue[];
  errors: number;
  warnings: number;
  canPublish: boolean;
  /** raw teacher text -> resolved Teacher.id (or null when unknown) */
  resolved: Record<string, string | null>;
  unresolvedTeachers: string[];
  /** unmatched name -> a frequently used, similar name (probable OCR misreading) */
  suggestions: Record<string, string>;
};

export { newId } from "../common";
