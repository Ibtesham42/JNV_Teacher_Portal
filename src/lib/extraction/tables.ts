import type { PageContent, Word } from "./types";
import { joinCellText, meanConf, xc, yc } from "./layout";
import { classRank, findDayInText, normalizeClassName, normalizeSection, parseTimeRange } from "./normalize";
import { splitCell } from "./cells";
import { newId, type ExtractedRemedial } from "./schema";
import type { WeekdayName } from "../time";

// ---------------------------------------------------------------- grid from ruled lines

export type GridCell = { x0: number; x1: number; y0: number; y1: number; words: Word[]; lines: string[]; text: string; conf: number };
export type GridRow = { y0: number; y1: number; cells: GridCell[] };
export type Grid = { x0: number; x1: number; y0: number; y1: number; rows: GridRow[] };

/**
 * Cells of a ruled table, including merged cells: a cell simply spans every column whose divider
 * is missing inside that row. Needs the ruled lines detected on the scanned image.
 */
export function buildGrid(page: PageContent): Grid | null {
  const rules = page.rules;
  if (!rules || !rules.h.length) return null;

  const sorted = [...rules.h].sort((a, b) => a.y - b.y);
  const lines: { y: number; x0: number; x1: number }[] = [];
  for (const s of sorted) {
    const l = lines[lines.length - 1];
    if (l && s.y - l.y <= 8) {
      l.x0 = Math.min(l.x0, s.x0);
      l.x1 = Math.max(l.x1, s.x1);
      l.y = (l.y + s.y) / 2;
    } else lines.push({ ...s });
  }
  const maxSpan = Math.max(...lines.map((l) => l.x1 - l.x0));
  if (maxSpan < rules.width * 0.4) return null;
  const full = lines.filter((l) => l.x1 - l.x0 >= maxSpan * 0.85);
  if (full.length < 3) return null;
  const top = full[0].y;
  const bottom = full[full.length - 1].y;
  const tx0 = Math.min(...full.map((l) => l.x0));
  const tx1 = Math.max(...full.map((l) => l.x1));
  const rowYs = lines.filter((l) => l.y >= top - 4 && l.y <= bottom + 4 && l.x1 - l.x0 >= rules.width * 0.12).map((l) => l.y);

  // vertical rules: merge broken pieces of the same line
  const vs = rules.v.filter((v) => v.x >= tx0 - 10 && v.x <= tx1 + 10).sort((a, b) => a.x - b.x);
  const vLines: { x: number; iv: [number, number][] }[] = [];
  for (const v of vs) {
    const g = vLines[vLines.length - 1];
    if (g && v.x - g.x <= 8) g.iv.push([v.y0, v.y1]);
    else vLines.push({ x: v.x, iv: [[v.y0, v.y1]] });
  }
  const covered = (iv: [number, number][], y0: number, y1: number) => {
    let total = 0;
    for (const [a, b] of iv) total += Math.max(0, Math.min(b, y1) - Math.max(a, y0));
    return total;
  };

  const rows: GridRow[] = [];
  for (let i = 0; i < rowYs.length - 1; i++) {
    const y0 = rowYs[i];
    const y1 = rowYs[i + 1];
    if (y1 - y0 < 18) continue;
    const xs = [tx0, tx1];
    for (const v of vLines) if (v.x > tx0 + 10 && v.x < tx1 - 10 && covered(v.iv, y0, y1) >= (y1 - y0) * 0.55) xs.push(v.x);
    xs.sort((a, b) => a - b);
    const cuts = xs.filter((x, k) => k === 0 || x - xs[k - 1] > 12);
    const cells: GridCell[] = [];
    for (let k = 0; k < cuts.length - 1; k++) {
      cells.push({ x0: cuts[k], x1: cuts[k + 1], y0, y1, words: [], lines: [], text: "", conf: 0 });
    }
    rows.push({ y0, y1, cells });
  }
  for (const w of page.words) {
    const cx = xc(w);
    const cy = yc(w);
    const row = rows.find((r) => cy >= r.y0 && cy < r.y1);
    const cell = row?.cells.find((c) => cx >= c.x0 && cx < c.x1);
    cell?.words.push(w);
  }
  for (const r of rows) {
    for (const c of r.cells) {
      c.lines = joinCellText(c.words);
      c.text = c.lines.join(" ").replace(/\s+/g, " ").trim();
      c.conf = meanConf(c.words) / 100;
    }
  }
  return { x0: tx0, x1: tx1, y0: top, y1: bottom, rows };
}

// ---------------------------------------------------------------- remedial / enrichment matrix

const CLASS_LABEL_RE = /^(VIII|VII|VI|IX|XII|XI|X|V|IV)([A-F])?$/;

export function parseClassLabel(text: string): { className: string; section: string } | null {
  const t = text.toUpperCase().replace(/[^A-Z0-9|]/g, "");
  if (!t) return null;
  const tryIt = (s: string) => {
    const m = s.match(CLASS_LABEL_RE);
    return m ? { className: m[1], section: m[2] ?? "" } : null;
  };
  const direct = tryIt(t);
  if (direct) return direct;
  const fixed = tryIt(t.replace(/[L1|]/g, "I"));
  if (fixed) return fixed;
  const cn = normalizeClassName(t);
  return cn ? { className: cn, section: "" } : null;
}

export type RemedialMatrix = { items: ExtractedRemedial[]; notes: string[] };

/** Classes as rows, days as column groups, sessions as sub-columns (merged cells span sessions). */
export function parseRemedialMatrix(page: PageContent, titleText = ""): RemedialMatrix | null {
  const grid = buildGrid(page);
  if (!grid) return null;
  const notes: string[] = [];

  const dayRowIdx = grid.rows.findIndex((r) => r.cells.filter((c) => findDayInText(c.text)).length >= 2);
  if (dayRowIdx < 0) return null;
  const dayCells = grid.rows[dayRowIdx].cells
    .map((c) => ({ c, day: findDayInText(c.text) }))
    .filter((d): d is { c: (typeof grid.rows)[0]["cells"][0]; day: WeekdayName } => !!d.day);

  let timeRowIdx = -1;
  for (let i = dayRowIdx + 1; i < Math.min(grid.rows.length, dayRowIdx + 3); i++) {
    if (grid.rows[i].cells.filter((c) => parseTimeRange(c.text)).length >= 2) {
      timeRowIdx = i;
      break;
    }
  }
  if (timeRowIdx < 0) return null;

  const subcols = grid.rows[timeRowIdx].cells
    .map((c) => {
      const r = parseTimeRange(c.text);
      const cx = (c.x0 + c.x1) / 2;
      const d = dayCells.find((dc) => cx >= dc.c.x0 && cx < dc.c.x1);
      return r && d ? { cx, x0: c.x0, x1: c.x1, start: r.start, end: r.end, day: d.day } : null;
    })
    .filter((s): s is NonNullable<typeof s> => !!s);
  if (subcols.length < 2) return null;
  const firstX = subcols[0].x0;

  const lower = titleText.toLowerCase();
  const kinds = [/remedial/.test(lower), /life\s*skill/.test(lower), /enrich/.test(lower)].filter(Boolean).length;
  const category: ExtractedRemedial["category"] =
    kinds === 1 ? (/remedial/.test(lower) ? "REMEDIAL" : /life\s*skill/.test(lower) ? "LIFE_SKILL" : "ENRICHMENT") : "OTHER";
  const range = titleText.match(/class(?:es)?\s+([VXIl1|]+|\d+)\s+to\s+([VXIl1|]+|\d+)/i);
  const lastClass = range ? normalizeClassName(range[2]) : null;

  const items: ExtractedRemedial[] = [];
  let prev: { className: string; section: string } | null = null;
  for (let i = timeRowIdx + 1; i < grid.rows.length; i++) {
    const row = grid.rows[i];
    const labelCell = row.cells.find((c) => c.x1 <= firstX + 6);
    const bodyCells = row.cells.filter((c) => c.x0 >= firstX - 6);
    if (!bodyCells.some((c) => c.text)) continue;

    let label = labelCell ? parseClassLabel(labelCell.text) : null;
    let labelConf: number | null = null;
    const rawLabel = labelCell?.text ?? "";
    // the same class twice in a row (without sections) means the label was misread
    if (label && prev && !prev.section && !label.section && label.className === prev.className) label = null;
    if (!label && prev && !prev.section && lastClass && classRank(prev.className) < classRank(lastClass)) {
      // the label cell was unreadable: continue the sequence, but flag it
      const order = ["VI", "VII", "VIII", "IX", "X", "XI", "XII"];
      const next: string | undefined = order[order.indexOf(prev.className) + 1];
      if (next) {
        label = { className: next, section: "" };
        labelConf = 0.4;
        notes.push(`Row ${i - timeRowIdx}: the class label could not be read${rawLabel ? ` (read as "${rawLabel}")` : ""}; assumed Class ${next} (next after ${prev.className}, heading says "to ${lastClass}"). Please confirm.`);
      }
    }
    if (!label) {
      notes.push(`Row ${i - timeRowIdx}: class label not recognised ("${labelCell?.text ?? ""}").`);
      label = { className: "", section: "" };
    } else prev = label;

    for (const cell of bodyCells) {
      if (!cell.text) continue;
      const covered = subcols.filter((s) => s.cx > cell.x0 + 2 && s.cx < cell.x1 - 2);
      if (!covered.length) continue;
      const split = splitCell(cell.lines);
      if (!split || (!split.subject && !split.teacher)) continue;
      const byDay = new Map<WeekdayName, typeof covered>();
      for (const s of covered) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
      for (const [day, cols] of byDay) {
        const start = cols.map((c) => c.start).sort()[0];
        const end = cols.map((c) => c.end).sort().at(-1)!;
        const conf = labelConf != null ? Math.min(labelConf, cell.conf) : cell.conf;
        items.push({
          id: newId("r"),
          category,
          className: label.className,
          section: normalizeSection(label.section),
          day,
          startTime: start,
          endTime: end,
          activity: split.subject,
          teacherName: split.teacher,
          confidence: Number(Math.min(0.99, Math.max(0.05, conf)).toFixed(2)),
        });
      }
    }
  }
  if (!items.length) return null;
  return { items, notes };
}
