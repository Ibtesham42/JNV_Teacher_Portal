import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { draftDataSchema, newId, type DraftData } from "./schema";
import { normalizeClassName, normalizeDay, normalizeSection } from "./normalize";
import { isClock } from "../time";
import type { PageContent } from "./types";
import type { DocKind } from "./heuristic";

export function aiEnabled(): boolean {
  return !!config.ai.apiKey;
}

const timeProp = { type: ["string", "null"], description: "24-hour HH:MM, e.g. 08:15 or 13:30" };
const conf = { type: "number", minimum: 0, maximum: 1, description: "How sure you are that you read this correctly" };

const TOOL: Anthropic.Tool = {
  name: "record_document",
  description: "Record the structured content that is printed in the document page(s).",
  input_schema: {
    type: "object",
    properties: {
      session: { type: ["string", "null"], description: 'Academic session if printed, e.g. "2025-26"' },
      title: { type: ["string", "null"] },
      periods: {
        type: "array",
        description: "One entry per class/section/day/column of a class timetable (breaks included).",
        items: {
          type: "object",
          properties: {
            className: { type: "string", description: 'Roman numeral, e.g. "VI", "VII", "X"' },
            section: { type: "string", description: 'Section letter or ""' },
            day: { enum: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] },
            slot: { type: "integer", description: "0-based column position within the day, breaks included" },
            periodNumber: { type: ["integer", "null"], description: "printed period number; null for a break" },
            isBreak: { type: "boolean" },
            label: { type: ["string", "null"], description: 'e.g. "BREAK" for break columns' },
            startTime: timeProp,
            endTime: timeProp,
            subject: { type: "string" },
            teacherName: { type: "string", description: "exactly as printed (name and/or code); empty string if none" },
            room: { type: ["string", "null"] },
            confidence: conf,
          },
          required: ["className", "section", "day", "slot", "periodNumber", "isBreak", "subject", "teacherName", "confidence"],
        },
      },
      modDuties: {
        type: "array",
        description: "MOD (master/teacher on duty) entries that are explicitly printed with a calendar date.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            teacherName: { type: "string" },
            description: { type: "string" },
            confidence: conf,
          },
          required: ["date", "teacherName", "confidence"],
        },
      },
      weeklyOffs: {
        type: "array",
        description: "Weekly off day per teacher, only if printed.",
        items: {
          type: "object",
          properties: {
            day: { enum: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] },
            teacherName: { type: "string" },
            confidence: conf,
          },
          required: ["day", "teacherName", "confidence"],
        },
      },
      remedial: {
        type: "array",
        description: "Remedial / life skill / enrichment schedule rows.",
        items: {
          type: "object",
          properties: {
            category: { enum: ["REMEDIAL", "LIFE_SKILL", "ENRICHMENT", "OTHER"] },
            className: { type: "string" },
            section: { type: "string" },
            day: { enum: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", null] },
            startTime: timeProp,
            endTime: timeProp,
            activity: { type: "string" },
            teacherName: { type: "string" },
            confidence: conf,
          },
          required: ["category", "className", "activity", "confidence"],
        },
      },
      clubs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            teachers: { type: "array", items: { type: "string" } },
            activities: { type: "array", items: { type: "string" } },
            confidence: conf,
          },
          required: ["name", "teachers", "activities", "confidence"],
        },
      },
      warnings: { type: "array", items: { type: "string" }, description: "Anything unreadable or ambiguous." },
    },
    required: ["periods", "modDuties", "weeklyOffs", "remedial", "clubs", "warnings"],
  },
};

const SYSTEM = `You transcribe official school documents (Jawahar Navodaya Vidyalaya routines, remedial schedules, club lists) into structured data.

Rules:
- Copy only what is printed. NEVER invent teachers, subjects, times, dates, MOD duties or weekly offs. If something is not in the document, omit it (or use an empty string / null).
- Copy teacher names / codes exactly as printed (keep "Mr."/"TGT-SCI" style text as-is).
- Class timetable: one "periods" entry per class + section + day + column. Keep column order in "slot" (0-based, breaks included). Break columns get isBreak=true and periodNumber=null.
- Times are 24-hour HH:MM. School hours are 07:00-17:00, so "1:30" means 13:30.
- Class is a Roman numeral (VI, VII, VIII, IX, X, XI, XII). Section is a single letter or "".
- MOD duties need a calendar date; if only a weekday is printed, do not create an entry and mention it in warnings.
- Give a confidence (0-1) per record; use lower values for smudged, stamped-over or ambiguous text.
- Ignore signatures and stamps. List anything unreadable in "warnings".`;

async function toModelImage(page: PageContent): Promise<{ data: string; mediaType: "image/png" | "image/jpeg" } | null> {
  if (!page.image) return null;
  return { data: page.image.data.toString("base64"), mediaType: page.image.mediaType };
}

export function toDraft(kind: DocKind, raw: any): DraftData {
  const periods = (raw.periods ?? [])
    .map((p: any) => {
      const cn = normalizeClassName(String(p.className ?? ""));
      const day = normalizeDay(String(p.day ?? ""));
      if (!cn || !day) return null;
      const start = isClock(p.startTime) ? p.startTime : null;
      const end = isClock(p.endTime) ? p.endTime : null;
      return {
        id: newId("p"),
        className: cn,
        section: normalizeSection(p.section),
        day,
        slot: Number.isInteger(p.slot) ? p.slot : 0,
        periodNumber: p.isBreak ? null : Number.isInteger(p.periodNumber) ? p.periodNumber : null,
        isBreak: !!p.isBreak,
        label: p.isBreak ? String(p.label || "BREAK") : null,
        startTime: start,
        endTime: end,
        subject: p.isBreak ? "" : String(p.subject ?? ""),
        teacherName: p.isBreak ? "" : String(p.teacherName ?? ""),
        room: p.room ? String(p.room) : null,
        confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
      };
    })
    .filter(Boolean);

  const mods = (raw.modDuties ?? [])
    .filter((m: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(m.date)) && String(m.teacherName ?? "").trim())
    .map((m: any) => ({
      id: newId("m"),
      date: m.date,
      teacherName: String(m.teacherName),
      description: String(m.description ?? ""),
      confidence: typeof m.confidence === "number" ? m.confidence : 0.5,
    }));

  const offs = (raw.weeklyOffs ?? [])
    .map((w: any) => ({ day: normalizeDay(String(w.day ?? "")), teacherName: String(w.teacherName ?? ""), confidence: w.confidence }))
    .filter((w: any) => w.day && w.teacherName.trim())
    .map((w: any) => ({ id: newId("w"), day: w.day, teacherName: w.teacherName, confidence: typeof w.confidence === "number" ? w.confidence : 0.5 }));

  const remedial = (raw.remedial ?? []).map((r: any) => ({
    id: newId("r"),
    category: ["REMEDIAL", "LIFE_SKILL", "ENRICHMENT", "OTHER"].includes(r.category) ? r.category : "REMEDIAL",
    className: normalizeClassName(String(r.className ?? "")) ?? String(r.className ?? ""),
    section: normalizeSection(r.section),
    day: normalizeDay(String(r.day ?? "")),
    startTime: isClock(r.startTime) ? r.startTime : null,
    endTime: isClock(r.endTime) ? r.endTime : null,
    activity: String(r.activity ?? ""),
    teacherName: String(r.teacherName ?? ""),
    confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
  }));

  const clubs = (raw.clubs ?? [])
    .filter((c: any) => String(c.name ?? "").trim())
    .map((c: any) => ({
      id: newId("c"),
      name: String(c.name),
      teachers: (c.teachers ?? []).map(String),
      activities: (c.activities ?? []).map(String),
      confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
    }));

  return draftDataSchema.parse({
    kind,
    session: raw.session ? String(raw.session) : null,
    title: raw.title ? String(raw.title) : "",
    periods,
    modDuties: mods,
    weeklyOffs: offs,
    remedial,
    clubs,
    notes: (raw.warnings ?? []).map((w: unknown) => `AI: ${String(w)}`),
  });
}

function merge(target: DraftData, add: DraftData) {
  target.periods.push(...add.periods);
  target.modDuties.push(...add.modDuties);
  target.weeklyOffs.push(...add.weeklyOffs);
  target.remedial.push(...add.remedial);
  target.clubs.push(...add.clubs);
  target.notes.push(...add.notes);
  target.session ||= add.session;
  target.title ||= add.title;
}

/** Vision extraction: page images (+ OCR text as a hint) -> structured JSON via a forced tool call. */
export async function aiExtract(
  pages: PageContent[],
  ocrTextByPage: string[],
  kind: DocKind,
  onPage?: (done: number, total: number) => Promise<void>,
): Promise<DraftData> {
  const client = new Anthropic({ apiKey: config.ai.apiKey });
  const result = draftDataSchema.parse({ kind });
  let done = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const img = await toModelImage(page);
    const content: Anthropic.ContentBlockParam[] = [];
    if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
    const hint = ocrTextByPage[i]?.trim();
    content.push({
      type: "text",
      text: [
        `Document type: ${kind}. This is page ${page.pageNumber} of ${pages.length}.`,
        img ? "Transcribe the page image into the record_document tool." : "Structure the following text into the record_document tool.",
        hint ? `Machine-read text of this page (may contain OCR errors - the image is authoritative when present):\n${hint.slice(0, 12000)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const stream = client.messages.stream({
      model: config.ai.model,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    const block = msg.content.find((b) => b.type === "tool_use");
    if (block && block.type === "tool_use") merge(result, toDraft(kind, block.input));
    else result.notes.push(`AI: page ${page.pageNumber} returned no structured data.`);
    done += 1;
    await onPage?.(done, pages.length);
  }
  return result;
}
