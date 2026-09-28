import { stripSerial } from "../teacherIdentity";
import { WEEKDAYS, type WeekdayName, parseClock } from "../time";

const ROMAN: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
  11: "XI",
  12: "XII",
};
const ROMAN_TO_NUM: Record<string, number> = Object.fromEntries(
  Object.entries(ROMAN).map(([n, r]) => [r, Number(n)]),
);

/** "Class 6", "VI", "6th", "class-vii" -> "VI" | "VII". Returns null if it is not a class. */
export function normalizeClassName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .toUpperCase()
    .replace(/\bCLASS(ES)?\b/g, "")
    .replace(/[^A-Z0-9|]/g, "")
    .replace(/(ST|ND|RD|TH)$/, "");
  if (!s) return null;
  if (ROMAN_TO_NUM[s]) return s;
  if (/^\d{1,2}$/.test(s) && ROMAN[Number(s)]) return ROMAN[Number(s)];
  // OCR reads "I" as l, 1 or | (e.g. "Vill" -> VIII)
  if (/^[VXIL1|]+$/.test(s)) {
    const fixed = s.replace(/[L1|]/g, "I");
    if (ROMAN_TO_NUM[fixed]) return fixed;
  }
  return null;
}

export function classRank(name: string): number {
  return ROMAN_TO_NUM[name] ?? 99;
}

export function normalizeSection(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.toUpperCase().replace(/[^A-Z]/g, "");
  return s.slice(0, 3);
}

const DAY_ALIASES: Record<string, WeekdayName> = {
  MON: "MONDAY",
  MONDAY: "MONDAY",
  TUE: "TUESDAY",
  TUES: "TUESDAY",
  TUESDAY: "TUESDAY",
  WED: "WEDNESDAY",
  WEDS: "WEDNESDAY",
  WEDNESDAY: "WEDNESDAY",
  THU: "THURSDAY",
  THUR: "THURSDAY",
  THURS: "THURSDAY",
  THURSDAY: "THURSDAY",
  FRI: "FRIDAY",
  FRIDAY: "FRIDAY",
  SAT: "SATURDAY",
  SATURDAY: "SATURDAY",
  SUN: "SUNDAY",
  SUNDAY: "SUNDAY",
};

export function normalizeDay(raw: string | null | undefined): WeekdayName | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z]/g, "");
  return DAY_ALIASES[s] ?? null;
}

export const DAY_REGEX = /\b(MON|TUE|TUES|WED|WEDS|THU|THUR|THURS|FRI|SAT|SUN)(DAY|SDAY|NESDAY|RSDAY|URDAY)?\b/i;

export function findDayInText(text: string): WeekdayName | null {
  const m = text.match(DAY_REGEX);
  return m ? normalizeDay(m[0]) : null;
}

/** Parse "8:15-8:55", "8.15 to 8.55", "12:55 – 1:30" into HH:MM pair. */
export function parseTimeRange(raw: string): { start: string; end: string } | null {
  const m = raw.match(
    /(\d{1,2}\s*[:.;]\s*\d{2}\s*(?:am|pm)?)\s*(?:-|–|—|to|TO)\s*(\d{1,2}\s*[:.;]\s*\d{2}\s*(?:am|pm)?)/i,
  );
  if (!m) return null;
  const start = parseClock(m[1]);
  let end = parseClock(m[2]);
  if (!start || !end) return null;
  // "11:45-12:20" style ranges: end < start means the end rolled to PM or a 12h clock wrap
  if (end <= start) {
    const [h, mm] = end.split(":").map(Number);
    if (h < 12) end = `${String(h + 12).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  return { start, end };
}

export function periodNumberFrom(raw: string): number | null {
  const s = raw.trim().toUpperCase().replace(/\./g, "");
  let m = s.match(/^(\d{1,2})\s*(ST|ND|RD|TH)?$/);
  if (m) return Number(m[1]);
  m = s.match(/^(?:PERIOD|PER|P)\s*[-:]?\s*(\d{1,2})$/);
  if (m) return Number(m[1]);
  const words: Record<string, number> = {
    FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10,
  };
  if (words[s]) return words[s];
  if (ROMAN_TO_NUM[s] && ROMAN_TO_NUM[s] <= 10) return ROMAN_TO_NUM[s];
  return null;
}

export function isBreakLabel(raw: string): boolean {
  return /\b(BREAK|RECESS|LUNCH|INTERVAL|TIFFIN|SHORT\s*BREAK)\b/i.test(raw);
}

export function cleanCell(raw: string): string {
  return raw
    .replace(/[|¦_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(raw: string): string {
  return stripSerial(raw)
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|shri|sri|smt|sir|madam|prof)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sortedDays(days: Iterable<string>): WeekdayName[] {
  const set = new Set(days);
  return WEEKDAYS.filter((d) => set.has(d));
}

export function guessSession(text: string): string | null {
  const m = text.match(/\b(20\d{2})\s*[-–/]\s*(\d{2,4})\b/);
  if (!m) return null;
  return `${m[1]}-${m[2].slice(-2)}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Find the first calendar date in the text (dd/mm/yyyy, dd-mm-yy, "12 March 2026"). Returns YYYY-MM-DD. */
export function findDate(text: string, defaultYear?: number): string | null {
  let m = text.match(/\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return validDate(y, mo, d);
  }
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s*(\d{4})?\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3] ? Number(m[3]) : defaultYear;
    if (!y) return null;
    return validDate(y, MONTHS[m[2].toLowerCase()], Number(m[1]));
  }
  return null;
}

function validDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
