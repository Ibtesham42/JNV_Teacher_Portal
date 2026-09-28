import type { PageContent } from "./types";
import { buildGrid } from "./tables";
import { findDate } from "./normalize";
import { newId, type ExtractedMod } from "./schema";
import { parseTeacherText } from "../teacherIdentity";

export type TableText = { heading: string; rows: string[][] };

/** Word tables come with their cell text; scans get theirs from the detected ruled grid. */
export function tablesOf(page: PageContent): TableText[] {
  if (page.tables?.length) return page.tables;
  const grid = buildGrid(page);
  if (!grid) return [];
  return [{ heading: "", rows: grid.rows.map((r) => r.cells.map((c) => c.text)) }];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

type Roles = { date: number; name: number; designation: number; house: number; classes: number; off: number };

function detectRoles(header: string[]): Roles {
  const idx = (re: RegExp, skip: number[] = []) => header.findIndex((h, i) => !skip.includes(i) && re.test(norm(h)));
  const off = idx(/weekly\s*off/);
  const date = idx(/^date\b|\bdate$/, off >= 0 ? [off] : []);
  const name = idx(/m\.?\s?o\.?\s?d\b|master on duty|\bname\b|teacher/);
  return {
    date,
    name,
    designation: idx(/designation|post|code/),
    house: idx(/house/),
    classes: idx(/class/),
    off,
  };
}

const iso = (s: string | undefined) => (s ? findDate(s) : null);

export type DutyParse = { items: ExtractedMod[]; notes: string[]; tablesSeen: number };

/**
 * MOD roster ("S.No | Date | Day | M.O.D. | Designation") and Sunday / holiday duty lists
 * ("Sl | Date | Name | Allotted House | Class Assigned | Weekly Off"). Only what is printed is read:
 * a date with no person named is reported, never filled in.
 */
export function parseDutyTables(pages: PageContent[]): DutyParse {
  const items: ExtractedMod[] = [];
  const notes: string[] = [];
  let tablesSeen = 0;

  for (const page of pages) {
    const sourceConf = page.source === "ocr" ? Math.max(0.05, Math.min(0.99, page.meanConf / 100)) : 0.97;
    for (const table of tablesOf(page)) {
      // header row = first of the first 3 rows that names both a date and a person column
      let headerIdx = -1;
      let roles: Roles | null = null;
      for (let i = 0; i < Math.min(3, table.rows.length); i++) {
        const r = detectRoles(table.rows[i]);
        if (r.date >= 0 && r.name >= 0) {
          headerIdx = i;
          roles = r;
          break;
        }
      }
      if (!roles || headerIdx < 0) continue;
      const header = table.rows[headerIdx].map(norm);
      const holiday = roles.house >= 0 || /holiday|sunday/.test(norm(table.heading)) || header.some((h) => /allotted house/.test(h));
      const isMod = header.some((h) => /m\.?\s?o\.?\s?d\b|master on duty/.test(h)) || /\bmod\b/.test(norm(table.heading));
      if (!holiday && !isMod) continue;
      tablesSeen++;

      let lastDate: string | null = null;
      for (const row of table.rows.slice(headerIdx + 1)) {
        const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
        const date: string | null = iso(cell(roles.date)) ?? (holiday ? lastDate : null);
        if (!date) continue;
        lastDate = date;
        const rawName = cell(roles.name);
        const designationCell = cell(roles.designation);

        if (!rawName) {
          if (designationCell) notes.push(`${date}: no person is named for ${holiday ? "holiday duty" : "MOD"} (only "${designationCell}" is printed) - not imported.`);
          continue;
        }
        const p = parseTeacherText(rawName);
        if (p.kind === "garbage") {
          notes.push(`${date}: "${rawName}" does not look like a teacher name - not imported.`);
          continue;
        }
        const teacherName = p.name;
        const designation = (p.kind === "person" ? (p.code ?? p.designation) : p.code) || (designationCell ? designationCell : null);
        const markedMod = /\(\s*MOD\s*\)/i.test(rawName);

        const house = holiday ? cell(roles.house) || null : null;
        const classes = holiday ? cell(roles.classes) || null : null;
        const offDate = holiday ? iso(cell(roles.off)) : null;
        const parts = holiday
          ? [house, classes ? `Class ${classes}` : null, offDate ? `weekly off ${offDate.split("-").reverse().join("-")}` : null, markedMod ? "MOD" : null].filter(Boolean)
          : [];
        items.push({
          id: newId("m"),
          date,
          teacherName,
          description: parts.join(" · "),
          dutyType: holiday ? "HOLIDAY" : "MOD",
          designation: designation ? designation.slice(0, 80) : null,
          house,
          classes,
          offDate,
          confidence: Number(sourceConf.toFixed(2)),
        });
      }
    }
  }
  return { items, notes, tablesSeen };
}
