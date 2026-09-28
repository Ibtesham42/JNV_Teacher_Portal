import type { Line, PageContent, Word } from "./types";
import { buildLines, joinCellText, matchesInLine, meanConf, median, nearestColumn, xc, yc } from "./layout";
import { isBreakLabel, normalizeClassName, normalizeDay, normalizeSection, parseTimeRange } from "./normalize";
import { newId, type ExtractedPeriod } from "./schema";
import { parenBalance, splitCell } from "./cells";
import type { WeekdayName } from "../time";

export { splitCell };

// class token: roman numerals as OCR reads them (l / 1 / | for I) or digits
const HEADING_RE =
  /\bCLASS(?:ES)?\s*[-:.]?\s*([VXIl1|]{1,5}|\d{1,2}(?:st|nd|rd|th)?)(?![A-Za-z])\s*(?:[-–—/(,.\s'"‘’“”`]*\b([A-F])\b['"‘’“”`)]*)?/i;
const STANDALONE_HEADING_RE = /^\s*([VXIl1|]{1,5})\s*[-–—(,]\s*['"‘’]?([A-F])['"’)]?\s*$/i;
const TIME_RANGE_RE =
  /\d{1,2}\s*[:.;]\s*\d{2}\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}\s*[:.;]\s*\d{2}\s*(?:am|pm)?/i;

export type Heading = { lineIdx: number; className: string; section: string };

export function findHeading(line: Line): { className: string; section: string } | null {
  let m = line.text.match(HEADING_RE);
  if (m && line.words.length <= 14) {
    const cn = normalizeClassName(m[1]);
    if (cn) return { className: cn, section: normalizeSection(m[2]) };
  }
  m = line.text.match(STANDALONE_HEADING_RE);
  if (m) {
    const cn = normalizeClassName(m[1]);
    if (cn) return { className: cn, section: normalizeSection(m[2]) };
  }
  return null;
}

// ---------------------------------------------------------------- columns

type Column = {
  xc: number;
  label: string;
  number: number | null;
  isBreak: boolean;
  start: string | null;
  end: string | null;
  /** break column OCR could not read (rotated text); rebuilt from the gap between two periods */
  inferred?: boolean;
};

const P_RE = /^P[-.]?(\d{1,2})$/i;
const ROMAN_PERIOD = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]);
const ROMAN_VAL: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const OCR_DIGIT: Record<string, number> = { i: 1, l: 1, s: 5, b: 8, o: 0, g: 9 };

/** "1st" "2nd" ... also as OCR misreads them ("ist", "lst", "Sth"). */
export function ordinalFromToken(word: string): number | null {
  const w = word.replace(/[.,:;()|]/g, "");
  const m = w.match(/^([A-Za-z0-9]{1,2})(st|nd|rd|th)$/i);
  if (!m) return null;
  const head = m[1].toLowerCase();
  const n = /^\d{1,2}$/.test(head) ? Number(head) : head.length === 1 ? OCR_DIGIT[head] : undefined;
  if (n == null || n < 1 || n > 12) return null;
  const expected = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return m[2].toLowerCase() === expected ? n : null;
}

function periodToken(word: string, allowBare: boolean, allowRoman: boolean): number | null {
  const o = ordinalFromToken(word);
  if (o != null) return o;
  const w = word.replace(/[.,:;()]/g, "");
  const m = w.match(P_RE);
  if (m) return Number(m[1]);
  if (allowBare && /^\d{1,2}$/.test(w)) return Number(w);
  if (allowRoman && ROMAN_PERIOD.has(w.toUpperCase())) return ROMAN_VAL[w.toUpperCase()];
  return null;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function detectColumns(headerLines: Line[]): Column[] {
  const tokens: Column[] = [];
  for (const line of headerLines) {
    const ordinalCount = line.words.filter((w) => ordinalFromToken(w.text) != null).length;
    const bareCount = line.words.filter((w) => /^\d{1,2}$/.test(w.text.replace(/[.,:;]/g, ""))).length;
    const romanCount = line.words.filter((w) => ROMAN_PERIOD.has(w.text.replace(/[.,:;]/g, "").toUpperCase())).length;
    const hasTime = TIME_RANGE_RE.test(line.text);
    for (const w of line.words) {
      if (isBreakLabel(w.text)) {
        tokens.push({ xc: xc(w), label: w.text.toUpperCase(), number: null, isBreak: true, start: null, end: null });
        continue;
      }
      const n = periodToken(w.text, bareCount >= 3 && !hasTime, romanCount >= 3 && ordinalCount === 0 && !hasTime);
      if (n != null) tokens.push({ xc: xc(w), label: w.text, number: n, isBreak: false, start: null, end: null });
    }
  }
  tokens.sort((a, b) => a.xc - b.xc);

  // merge near-duplicates (same label printed on two header lines)
  const merged: Column[] = [];
  for (const t of tokens) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.xc - t.xc) < 12 && prev.number === t.number && prev.isBreak === t.isBreak) continue;
    merged.push(t);
  }

  const ranges: { xc: number; start: string; end: string }[] = [];
  for (const line of headerLines) {
    for (const m of matchesInLine(line, TIME_RANGE_RE)) {
      const r = parseTimeRange(m.text);
      if (r) ranges.push({ xc: (m.x0 + m.x1) / 2, start: r.start, end: r.end });
    }
  }
  ranges.sort((a, b) => a.xc - b.xc);

  const periodTokens = merged.filter((c) => !c.isBreak);
  let cols: Column[];

  if (ranges.length >= 3 && ranges.length >= periodTokens.length) {
    // time ranges are the most reliable column markers; attach printed period numbers / BREAK labels
    const spacing = median(ranges.slice(1).map((r, i) => r.xc - ranges[i].xc)) || 100;
    const reach = Math.max(spacing * 0.6, 25);
    cols = ranges.map((r) => ({ xc: r.xc, label: "", number: null, isBreak: false, start: r.start, end: r.end }));
    for (const t of periodTokens) {
      const idx = nearestColumn(t.xc, cols.map((c) => c.xc));
      if (Math.abs(cols[idx].xc - t.xc) <= reach && cols[idx].number == null) {
        cols[idx].number = t.number;
        cols[idx].label = t.label;
      }
    }
    for (const b of merged.filter((c) => c.isBreak)) {
      const idx = nearestColumn(b.xc, cols.map((c) => c.xc));
      if (Math.abs(cols[idx].xc - b.xc) <= reach) {
        cols[idx].isBreak = true;
        cols[idx].number = null;
        cols[idx].label = "BREAK";
      } else {
        cols.push({ xc: b.xc, label: "BREAK", number: null, isBreak: true, start: null, end: null });
      }
    }
    cols.sort((a, b) => a.xc - b.xc);
    let n = 0;
    for (const c of cols) {
      if (c.isBreak) continue;
      if (c.number == null || c.number <= n) c.number = n + 1;
      n = c.number;
    }
  } else if (periodTokens.length < 2 && ranges.length >= 2) {
    let n = 0;
    return ranges.map((r) => ({ xc: r.xc, label: "", number: ++n, isBreak: false, start: r.start, end: r.end }));
  } else {
    cols = merged;
    if (cols.length < 2) return [];
    const spacing = median(cols.slice(1).map((c, i) => c.xc - cols[i].xc));
    for (const r of ranges) {
      const idx = nearestColumn(r.xc, cols.map((c) => c.xc));
      if (Math.abs(cols[idx].xc - r.xc) <= Math.max(spacing * 0.8, 20) && !cols[idx].start) {
        cols[idx].start = r.start;
        cols[idx].end = r.end;
      }
    }
  }

  // an unreadable (rotated) break column shows up as a gap between one period's end and the next start
  const withBreaks: Column[] = [];
  cols.forEach((c, i) => {
    withBreaks.push(c);
    const next = cols[i + 1];
    if (next && !c.isBreak && !next.isBreak && c.end && next.start && toMin(next.start) > toMin(c.end)) {
      withBreaks.push({ xc: (c.xc + next.xc) / 2, label: "BREAK", number: null, isBreak: true, start: c.end, end: next.start, inferred: true });
    }
  });
  return withBreaks;
}

// ---------------------------------------------------------------- cells

type CellOut = { row: number; col: number; lines: string[]; conf: number; straddle: boolean };

/** Header labels are rarely aligned with cell text; pull each column centre to where its cell text really sits. */
function refineCenters(words: Word[], initial: number[]): number[] {
  let centers = [...initial];
  for (let it = 0; it < 3; it++) {
    const buckets: number[][] = centers.map(() => []);
    for (const w of words) buckets[nearestColumn(xc(w), centers)].push(xc(w));
    const next = centers.map((c, i) => (buckets[i].length >= 3 ? median(buckets[i]) : c));
    // keep the order strictly increasing
    for (let i = 1; i < next.length; i++) if (next[i] <= next[i - 1]) return centers;
    centers = next;
  }
  return centers;
}

function assignCells(
  words: Word[],
  initialCenters: number[],
  rowYcs: number[],
  yTop: number,
  yBottom: number,
  xMin: number,
): CellOut[] {
  const cells = new Map<string, { words: Word[]; straddle: boolean }>();
  const inBody = words.filter((w) => yc(w) >= yTop && yc(w) < yBottom && xc(w) > xMin);
  const colCenters = refineCenters(inBody, initialCenters);

  // Row labels are either vertically centred in their row (band edges = midpoints) or sit on the
  // first line of the row (band starts at the label). Detect which by looking at where the text is.
  const lh = median(inBody.map((w) => w.y1 - w.y0)) || 10;
  let above = 0;
  let below = 0;
  for (const w of inBody) {
    let best = 0;
    for (let i = 1; i < rowYcs.length; i++) if (Math.abs(rowYcs[i] - yc(w)) < Math.abs(rowYcs[best] - yc(w))) best = i;
    const dy = yc(w) - rowYcs[best];
    if (dy < -lh * 0.6) above++;
    else if (dy > lh * 0.6) below++;
  }
  const topAligned = rowYcs.length >= 2 && below > 0 && above <= below * 0.05;

  for (const w of inBody) {
    const wy = yc(w);
    let row = 0;
    if (topAligned) {
      for (let i = 0; i < rowYcs.length; i++) if (wy >= rowYcs[i] - lh * 0.6) row = i;
    } else {
      for (let i = 0; i < rowYcs.length; i++) {
        const hi = i === rowYcs.length - 1 ? yBottom : (rowYcs[i] + rowYcs[i + 1]) / 2;
        const lo = i === 0 ? yTop : (rowYcs[i - 1] + rowYcs[i]) / 2;
        if (wy >= lo && wy < hi) {
          row = i;
          break;
        }
      }
    }
    const col = nearestColumn(xc(w), colCenters);
    const dists = colCenters.map((c) => Math.abs(c - xc(w))).sort((a, b) => a - b);
    const straddle = dists.length > 1 && dists[1] > 0 && dists[0] / dists[1] > 0.8;
    const key = `${row}|${col}`;
    const cell = cells.get(key) ?? { words: [], straddle: false };
    cell.words.push(w);
    cell.straddle ||= straddle && w.text.length > 3;
    cells.set(key, cell);
  }
  rebalanceWrapped(cells, rowYcs.length, colCenters.length);
  return [...cells.entries()].map(([k, v]) => {
    const [row, col] = k.split("|").map(Number);
    return { row, col, lines: joinCellText(v.words), conf: meanConf(v.words) / 100, straddle: v.straddle };
  });
}

/**
 * Teacher codes wrap over two lines ("Kausal Bodh(TGT-" / "ART)"). When the rows are slightly
 * tilted the second line can land in the next row; a line that only closes a bracket belongs to the
 * cell above that has an unclosed one (and vice versa).
 */
function rebalanceWrapped(cells: Map<string, { words: Word[]; straddle: boolean }>, rows: number, cols: number) {
  const lineTexts = (ws: Word[]) => buildLines(ws);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      const a = cells.get(`${r}|${c}`);
      const b = cells.get(`${r + 1}|${c}`);
      if (!a || !b) continue;
      const aText = lineTexts(a.words).map((l) => l.text).join(" ");
      const bLines = lineTexts(b.words);
      if (parenBalance(aText) > 0 && bLines.length && parenBalance(bLines[0].text) < 0) {
        const first = new Set(bLines[0].words);
        a.words.push(...bLines[0].words);
        b.words = b.words.filter((w) => !first.has(w));
        if (!b.words.length) cells.delete(`${r + 1}|${c}`);
        continue;
      }
      const bText = bLines.map((l) => l.text).join(" ");
      const aLines = lineTexts(a.words);
      const last = aLines[aLines.length - 1];
      if (parenBalance(bText) < 0 && last && parenBalance(last.text) > 0 && aLines.length > 1) {
        const set = new Set(last.words);
        b.words.push(...last.words);
        a.words = a.words.filter((w) => !set.has(w));
      }
    }
  }
}

// ---------------------------------------------------------------- section parsing

export type SectionResult = { periods: ExtractedPeriod[]; notes: string[] };

function cellToPeriod(
  cell: CellOut,
  base: { className: string; section: string; day: WeekdayName; slot: number; col: Column },
  sourceIsText: boolean,
): ExtractedPeriod | null {
  const { col } = base;
  if (col.inferred) return null;
  const text = cell.lines.join(" ");
  if (col.isBreak) {
    if (!/[A-Za-z0-9]/.test(text)) return null;
  }
  const split = splitCell(cell.lines);
  if (!split) return null;
  let conf = sourceIsText ? 0.97 : Math.min(0.99, Math.max(0.05, cell.conf));
  if (cell.straddle) conf = Math.min(conf, 0.6);
  if (split.repaired) conf = Math.min(conf, 0.45); // unbalanced brackets: text was probably cut between two rows
  if (!col.isBreak && !split.subject && !split.teacher) return null;
  return {
    id: newId("p"),
    className: base.className,
    section: base.section,
    day: base.day,
    slot: base.slot,
    periodNumber: col.isBreak ? null : col.number,
    isBreak: col.isBreak,
    label: col.isBreak ? split.subject || "BREAK" : null,
    startTime: col.start,
    endTime: col.end,
    subject: col.isBreak ? "" : split.subject,
    teacherName: col.isBreak ? "" : split.teacher,
    room: null,
    confidence: Number(conf.toFixed(2)),
  };
}

function parseDaysAsRows(
  lines: Line[],
  dayLines: { line: Line; day: WeekdayName; word: Word }[],
  className: string,
  section: string,
  sourceIsText: boolean,
  yBottom: number,
): SectionResult {
  const notes: string[] = [];
  const label = `${className}${section ? "-" + section : ""}`;
  const firstDayIdx = lines.indexOf(dayLines[0].line);
  // header = everything up to the last line that carries period labels / times; text between
  // that line and the first day label already belongs to the first row (cells are vertically centred)
  const isHeaderish = (l: Line) =>
    TIME_RANGE_RE.test(l.text) ||
    l.words.some((w) => periodToken(w.text, false, false) != null || isBreakLabel(w.text));
  let lastHeader = -1;
  for (let i = 0; i < firstDayIdx; i++) if (isHeaderish(lines[i])) lastHeader = i;
  const headerLines = lines.slice(0, lastHeader + 1);
  const columns = detectColumns(headerLines);
  if (columns.length < 2) {
    notes.push(`${label}: could not find the period columns.`);
    return { periods: [], notes };
  }
  const rowYcs = dayLines.map((d) => d.line.yc);
  const spacing = rowYcs.length > 1 ? median(rowYcs.slice(1).map((y, i) => y - rowYcs[i])) : 40;
  const yTop = headerLines.length ? headerLines[headerLines.length - 1].y1 : dayLines[0].line.y0 - spacing / 2;
  const bottom = Math.min(yBottom, rowYcs[rowYcs.length - 1] + spacing * 0.6);
  const xMin = Math.max(...dayLines.map((d) => d.word.x1));

  const allWords = lines.flatMap((l) => l.words);
  const cells = assignCells(allWords, columns.map((c) => c.xc), rowYcs, yTop, bottom, xMin);
  const periods: ExtractedPeriod[] = [];
  for (const cell of cells) {
    const col = columns[cell.col];
    const p = cellToPeriod(cell, { className, section, day: dayLines[cell.row].day, slot: cell.col, col }, sourceIsText);
    if (p) periods.push(p);
  }
  columns.forEach((col, slot) => {
    if (!col.inferred) return;
    for (const d of dayLines) {
      periods.push({
        id: newId("p"), className, section, day: d.day, slot, periodNumber: null, isBreak: true, label: "BREAK",
        startTime: col.start, endTime: col.end, subject: "", teacherName: "", room: null, confidence: 0.6,
      });
    }
    notes.push(`${label}: the break column (${col.start}-${col.end}) is not readable in the scan; it was added from the gap between the periods.`);
  });
  return { periods, notes };
}

function parseDaysAsColumns(
  lines: Line[],
  headerLine: Line,
  className: string,
  section: string,
  sourceIsText: boolean,
  yBottom: number,
): SectionResult {
  const notes: string[] = [];
  const dayCols = headerLine.words
    .map((w) => ({ day: normalizeDay(w.text.replace(/[.,:;]/g, "")), xc: xc(w), x0: w.x0 }))
    .filter((d): d is { day: WeekdayName; xc: number; x0: number } => !!d.day);
  const leftEdge = Math.min(...dayCols.map((d) => d.x0)) - 4;
  const headerIdx = lines.indexOf(headerLine);
  const body = lines.slice(headerIdx + 1);

  // row labels: text left of the first day column that is a period number / time range / break
  type Row = { yc: number; number: number | null; isBreak: boolean; start: string | null; end: string | null; label: string };
  const rows: Row[] = [];
  for (const line of body) {
    const left = line.words.filter((w) => xc(w) < leftEdge);
    if (!left.length) continue;
    const text = left.map((w) => w.text).join(" ");
    const range = text.match(TIME_RANGE_RE);
    const tr = range ? parseTimeRange(range[0]) : null;
    const brk = isBreakLabel(text);
    let num: number | null = null;
    for (const w of left) {
      const n = periodToken(w.text, true, false);
      if (n != null && !range?.[0].includes(w.text)) {
        num = n;
        break;
      }
    }
    if (tr || brk || num != null) {
      rows.push({ yc: line.yc, number: brk ? null : num, isBreak: brk, start: tr?.start ?? null, end: tr?.end ?? null, label: text });
    }
  }
  if (dayCols.length < 2 || rows.length < 2) {
    notes.push(`${className}${section ? "-" + section : ""}: could not find the period rows.`);
    return { periods: [], notes };
  }
  let seq = 0;
  for (const r of rows) if (!r.isBreak && r.number == null) r.number = ++seq;

  const spacing = median(rows.slice(1).map((r, i) => r.yc - rows[i].yc)) || 40;
  const bottom = Math.min(yBottom, rows[rows.length - 1].yc + spacing * 0.6);
  const cells = assignCells(
    body.flatMap((l) => l.words),
    dayCols.map((d) => d.xc),
    rows.map((r) => r.yc),
    headerLine.y1,
    bottom,
    leftEdge,
  );
  const periods: ExtractedPeriod[] = [];
  for (const cell of cells) {
    const r = rows[cell.row];
    const col: Column = { xc: 0, label: r.label, number: r.number, isBreak: r.isBreak, start: r.start, end: r.end };
    const p = cellToPeriod(cell, { className, section, day: dayCols[cell.col].day, slot: cell.row, col }, sourceIsText);
    if (p) periods.push(p);
  }
  return { periods, notes };
}

function dayLineOf(line: Line): { day: WeekdayName; word: Word } | null {
  for (const w of line.words.slice(0, 2)) {
    const d = normalizeDay(w.text.replace(/[.,:;]/g, ""));
    if (d) return { day: d, word: w };
  }
  return null;
}

function parseSection(
  lines: Line[],
  className: string,
  section: string,
  sourceIsText: boolean,
  yBottom: number,
): SectionResult {
  const label = `${className || "?"}${section ? "-" + section : ""}`;
  // days as columns: one line with >= 3 day names
  const headerLine = lines.find(
    (l) => l.words.filter((w) => normalizeDay(w.text.replace(/[.,:;]/g, ""))).length >= 3,
  );
  if (headerLine) return parseDaysAsColumns(lines, headerLine, className, section, sourceIsText, yBottom);

  const dayLines = lines
    .map((line) => {
      const d = dayLineOf(line);
      return d ? { line, ...d } : null;
    })
    .filter((d): d is { line: Line; day: WeekdayName; word: Word } => !!d);
  if (dayLines.length >= 2) return parseDaysAsRows(lines, dayLines, className, section, sourceIsText, yBottom);
  return { periods: [], notes: [`${label}: no timetable grid was recognised.`] };
}

export type RoutineParse = { periods: ExtractedPeriod[]; notes: string[] };

/** Rule-based timetable reader working on positioned words (OCR or text layer). */
export function parseRoutinePages(pages: PageContent[]): RoutineParse {
  const periods: ExtractedPeriod[] = [];
  const notes: string[] = [];
  for (const page of pages) {
    const lines = buildLines(page.words);
    if (!lines.length) continue;
    const sourceIsText = page.source !== "ocr";
    const headings: (Heading & { y0: number })[] = [];
    lines.forEach((l, i) => {
      const h = findHeading(l);
      if (h) headings.push({ lineIdx: i, ...h, y0: l.y0 });
    });
    if (!headings.length) {
      const r = parseSection(lines, "", "", sourceIsText, page.height);
      periods.push(...r.periods);
      notes.push(`Page ${page.pageNumber}: no "CLASS ..." heading found - set the class manually in the review.`);
      notes.push(...r.notes);
      continue;
    }
    headings.forEach((h, i) => {
      const next = headings[i + 1];
      const slice = lines.slice(h.lineIdx + 1, next ? next.lineIdx : lines.length);
      const r = parseSection(slice, h.className, h.section, sourceIsText, next ? next.y0 : page.height);
      periods.push(...r.periods);
      notes.push(...r.notes);
    });
  }
  return { periods, notes };
}
