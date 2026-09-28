import type { PageContent } from "./types";
import { buildLines } from "./layout";
import { draftDataSchema, type DraftData } from "./schema";
import { parseRoutinePages } from "./heuristic-routine";
import { linesOf, parseClubs, parseMod, parseRemedial, parseWeeklyOff } from "./heuristic-other";
import { guessSession } from "./normalize";
import { parseRemedialMatrix } from "./tables";
import { parseDutyTables } from "./duty-tables";
import type { TeacherLite } from "./teacherMatch";

export type DocKind = "ROUTINE" | "REMEDIAL" | "CLUB" | "OTHER";

/** Deterministic, rule-based extraction (no network, no LLM). */
export function heuristicExtract(pages: PageContent[], kind: DocKind, teachers: TeacherLite[]): DraftData {
  const notes: string[] = [];
  const lines = linesOf(pages);
  const headText = lines
    .slice(0, 40)
    .map((l) => l.text)
    .join(" ");
  const session = guessSession(headText);
  const defaultYear = session ? Number(session.slice(0, 4)) : new Date().getFullYear();
  const ctx = { teachers, defaultYear };

  const data = draftDataSchema.parse({ kind, session, title: "" });

  // a MOD / Sunday-holiday duty roster is recognised from its table headers, whichever type was chosen at upload
  if (kind === "REMEDIAL" || kind === "CLUB") {
    const duty = parseDutyTables(pages);
    if (duty.tablesSeen > 0 && duty.items.length) {
      data.kind = "OTHER";
      data.modDuties = duty.items;
      data.notes = [`This document is a MOD / Sunday-holiday duty roster (not a ${kind === "CLUB" ? "club list" : "remedial schedule"}), so it was read as one.`, ...duty.notes];
      return data;
    }
  }

  // a remedial / enrichment schedule uploaded as a "routine" is recognised from its heading
  const titleLines = lines.slice(0, 12).map((l) => l.text).join(" ");
  const looksRemedial = /remedial|enrichment|life\s*skill/i.test(titleLines);
  let handledAsRemedial = false;

  if (kind === "REMEDIAL" || ((kind === "ROUTINE" || kind === "OTHER") && looksRemedial)) {
    for (const page of pages) {
      const m = parseRemedialMatrix(page, titleLines);
      if (m) {
        data.remedial.push(...m.items);
        notes.push(...m.notes);
      }
    }
    if (!data.remedial.length) data.remedial = parseRemedial(lines, ctx);
    if (data.remedial.length) {
      handledAsRemedial = true;
      if (kind !== "REMEDIAL") {
        data.kind = "REMEDIAL";
        notes.push("This document looks like a remedial / enrichment schedule, so it was read as one (not as a class routine).");
      }
    }
  }

  if (!handledAsRemedial && (kind === "ROUTINE" || kind === "OTHER")) {
    const r = parseRoutinePages(pages);
    data.periods = r.periods;
    // MOD roster / holiday-duty tables (structured); the line reader is only a fallback for plain text
    const duty = parseDutyTables(pages);
    if (duty.tablesSeen > 0) {
      data.modDuties = duty.items;
      notes.push(...duty.notes);
      // a duty roster has no class timetable: the timetable reader's "not found" notes would only confuse
      if (r.periods.length) notes.push(...r.notes);
    } else {
      notes.push(...r.notes);
      data.modDuties = parseMod(lines, ctx, notes);
      data.weeklyOffs = parseWeeklyOff(lines, ctx);
    }
  }
  if (kind === "CLUB") data.clubs = parseClubs(lines, ctx);

  data.notes = notes;
  return data;
}

export function pageText(pages: PageContent[]): string {
  return pages
    .map((p) => buildLines(p.words).map((l) => l.text).join("\n"))
    .join("\n\n");
}
