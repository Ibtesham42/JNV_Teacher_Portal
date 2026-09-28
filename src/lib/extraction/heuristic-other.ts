import type { Line, PageContent } from "./types";
import { buildLines, matchesInLine } from "./layout";
import {
  cleanCell,
  findDate,
  findDayInText,
  normalizeClassName,
  normalizeSection,
  parseTimeRange,
  DAY_REGEX,
} from "./normalize";
import {
  newId,
  type ExtractedClub,
  type ExtractedMod,
  type ExtractedRemedial,
  type ExtractedWeeklyOff,
} from "./schema";
import { buildTeacherIndex, resolveTeacher, type TeacherLite } from "./teacherMatch";
import { findHeading, splitCell } from "./heuristic-routine";
import type { WeekdayName } from "../time";
import { parseTeacherText } from "../teacherIdentity";

const MOD_HEAD = /\bM\.?\s?O\.?\s?D\b|MASTER\s+ON\s+DUTY|TEACHER\s+ON\s+DUTY|DUTY\s+ROSTER/i;
const OFF_HEAD = /WEEKLY\s*[-]?\s*OFF|WEEK\s*[-]?\s*OFF|WEEKLY\s+HOLIDAY/i;
const HONORIFIC = /\b(?:Mr|Mrs|Ms|Miss|Dr|Sri|Shri|Smt|Prof)\.?\s+[A-Z]/;
const NOISE = /^(s\.?\s?no\.?|sl\.?\s?no\.?|sr\.?|name|names|teacher|teachers|day|date|weekly|off|mod|duty|of|the|and|&|-|–|—)$/i;

type Ctx = { teachers: TeacherLite[]; defaultYear?: number };

function looksLikeName(text: string, index: ReturnType<typeof buildTeacherIndex>): boolean {
  if (text.length < 3) return false;
  if (resolveTeacher(text, index).id) return true;
  return parseTeacherText(text).kind !== "garbage";
}

function namesIn(text: string, index: ReturnType<typeof buildTeacherIndex>): string[] {
  const cleaned = text
    .replace(DAY_REGEX, " ")
    .replace(/\b\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}\b/g, " ")
    .replace(/[:|]/g, ",");
  return cleaned
    .split(/,|&|;|\band\b|\s\/\s/i)
    .map((s) => cleanCell(s).replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, ""))
    .map((s) => {
      const p = parseTeacherText(s);
      return p.kind === "garbage" ? "" : p.name;
    })
    .filter((s) => s && !NOISE.test(s) && looksLikeName(s, index));
}

function sectionLines(lines: Line[], head: RegExp, maxLines = 60): Line[][] {
  const out: Line[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!head.test(lines[i].text)) continue;
    const block: Line[] = [lines[i]];
    for (let j = i + 1; j < lines.length && block.length < maxLines; j++) {
      const t = lines[j].text;
      if (findHeading(lines[j]) || (MOD_HEAD.test(t) && !head.test(t)) || (OFF_HEAD.test(t) && !head.test(t))) break;
      block.push(lines[j]);
    }
    out.push(block);
    i += block.length - 1;
  }
  return out;
}

export function parseMod(lines: Line[], ctx: Ctx, notes: string[]): ExtractedMod[] {
  const index = buildTeacherIndex(ctx.teachers);
  const out: ExtractedMod[] = [];
  for (const block of sectionLines(lines, MOD_HEAD)) {
    let currentDate: string | null = null;
    for (const line of block) {
      const date = findDate(line.text, ctx.defaultYear);
      const names = namesIn(line.text.replace(MOD_HEAD, " "), index);
      if (date) currentDate = date;
      else if (findDayInText(line.text) && names.length) {
        notes.push(`MOD line "${line.text}" has a weekday but no calendar date - not imported.`);
        continue;
      }
      if (!currentDate || !names.length) continue;
      const conf = line.words.reduce((a, w) => a + w.conf, 0) / line.words.length / 100;
      for (const n of names) {
        out.push({ id: newId("m"), date: currentDate, teacherName: n, description: "", dutyType: "MOD", designation: null, house: null, classes: null, offDate: null, confidence: Number(conf.toFixed(2)) });
      }
      if (!date) continue;
    }
  }
  return out;
}

export function parseWeeklyOff(lines: Line[], ctx: Ctx): ExtractedWeeklyOff[] {
  const index = buildTeacherIndex(ctx.teachers);
  const out: ExtractedWeeklyOff[] = [];
  for (const block of sectionLines(lines, OFF_HEAD)) {
    let currentDay: WeekdayName | null = null;
    for (const line of block) {
      const day = findDayInText(line.text);
      const names = namesIn(line.text.replace(OFF_HEAD, " "), index);
      if (day) currentDay = day;
      const useDay = day ?? currentDay;
      if (!useDay || !names.length) continue;
      const conf = line.words.reduce((a, w) => a + w.conf, 0) / line.words.length / 100;
      for (const n of names) out.push({ id: newId("w"), day: useDay, teacherName: n, confidence: Number(conf.toFixed(2)) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- remedial / enrichment

const CLASS_TOKEN = /^\s*(?:CLASS\s*[-:]?\s*)?(VIII|VII|VI|XII|XI|IX|X)\s*(?:[-–—]?\s*([A-F])\b)?/i;

export function parseRemedial(lines: Line[], ctx: Ctx): ExtractedRemedial[] {
  const out: ExtractedRemedial[] = [];
  let className = "";
  let section = "";
  let day: WeekdayName | null = null;
  let category: ExtractedRemedial["category"] = "REMEDIAL";

  for (const line of lines) {
    const t = line.text;
    if (/life\s*skill/i.test(t) && t.length < 60) category = "LIFE_SKILL";
    else if (/enrich/i.test(t) && t.length < 60) category = "ENRICHMENT";
    else if (/remedial/i.test(t) && t.length < 60) category = "REMEDIAL";

    const h = findHeading(line);
    if (h) {
      className = h.className;
      section = h.section;
      if (line.words.length <= 5) continue;
    }
    let rest = t;
    const cm = t.match(CLASS_TOKEN);
    if (cm && !h) {
      const cn = normalizeClassName(cm[1]);
      if (cn) {
        className = cn;
        section = normalizeSection(cm[2]);
        rest = t.slice(cm[0].length);
      }
    }
    const d = findDayInText(rest);
    if (d) day = d;
    const range = matchesInLine(line, /\d{1,2}\s*[:.;]\s*\d{2}\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}\s*[:.;]\s*\d{2}\s*(?:am|pm)?/i)[0];
    const tr = range ? parseTimeRange(range.text) : null;
    if (!tr) continue;
    rest = rest.replace(range.text, " ").replace(DAY_REGEX, " ");
    const split = splitCell([rest]);
    if (!split || !className) continue;
    const conf = line.words.reduce((a, w) => a + w.conf, 0) / line.words.length / 100;
    out.push({
      id: newId("r"),
      category,
      className,
      section,
      day: d ?? day,
      startTime: tr.start,
      endTime: tr.end,
      activity: split.subject,
      teacherName: split.teacher,
      confidence: Number(conf.toFixed(2)),
    });
  }
  return out;
}

// ---------------------------------------------------------------- clubs

const CLUB_LINE = /^\s*(?:\d+\s*[.)]\s*|[•*▪●-]\s*)?([A-Z][A-Za-z&' -]{2,50}?\s+Club)\b\s*[:\-–]?\s*(.*)$/i;
const MEMBER_LABEL = /^\s*(?:members?|teachers?|in-?charges?|co-?ordinators?|faculty)\s*(?:in\s+charge)?\s*[:\-–]\s*(.*)$/i;
const ACTIVITY_LABEL = /^\s*(?:suggested\s+)?(?:activities|activity|programmes?|events?)\s*[:\-–]\s*(.*)$/i;

function splitList(s: string): string[] {
  return s
    .split(/[;,•▪●]|\s\/\s|\s{3,}/)
    .map((x) => cleanCell(x).replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, ""))
    .filter((x) => x.length > 1);
}

export function parseClubs(lines: Line[], ctx: Ctx): ExtractedClub[] {
  const index = buildTeacherIndex(ctx.teachers);
  const out: ExtractedClub[] = [];
  let cur: ExtractedClub | null = null;
  let mode: "members" | "activities" | null = null;

  const flush = () => {
    if (cur && (cur.teachers.length || cur.activities.length || cur.name)) out.push(cur);
    cur = null;
    mode = null;
  };

  for (const line of lines) {
    const t = line.text;
    const conf = Number((line.words.reduce((a, w) => a + w.conf, 0) / line.words.length / 100).toFixed(2));
    const club = t.length < 80 ? t.match(CLUB_LINE) : null;
    if (club && !MEMBER_LABEL.test(t) && !ACTIVITY_LABEL.test(t)) {
      flush();
      cur = { id: newId("c"), name: cleanCell(club[1]), teachers: [], activities: [], confidence: conf };
      mode = null;
      const tail = cleanCell(club[2]);
      if (tail) {
        const names = tail.split(/[,;&]/).map((s) => cleanCell(s)).filter((s) => looksLikeName(s, index));
        if (names.length) cur.teachers.push(...names);
      }
      continue;
    }
    if (!cur) continue;
    const mm = t.match(MEMBER_LABEL);
    if (mm) {
      mode = "members";
      cur.teachers.push(...splitList(mm[1]));
      continue;
    }
    const am = t.match(ACTIVITY_LABEL);
    if (am) {
      mode = "activities";
      cur.activities.push(...splitList(am[1]));
      continue;
    }
    const body = cleanCell(t).replace(/^[•*▪●-]\s*|^\d+\s*[.)]\s*/, "");
    if (!body) continue;
    if (mode === "members" || (mode === null && looksLikeName(body, index) && HONORIFIC.test(body))) {
      cur.teachers.push(...splitList(body));
    } else {
      cur.activities.push(body);
      mode = "activities";
    }
    if (cur.confidence != null) cur.confidence = Math.min(cur.confidence, conf);
  }
  flush();
  return out.map((c) => ({ ...c, teachers: [...new Set(c.teachers)], activities: [...new Set(c.activities)] }));
}

export function linesOf(pages: PageContent[]): Line[] {
  return pages.flatMap((p) => buildLines(p.words));
}
