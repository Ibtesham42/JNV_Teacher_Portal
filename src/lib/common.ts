// Client-safe helpers (no Node / server imports).

export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type WeekdayName = (typeof WEEKDAYS)[number];

const DAY_LABELS: Record<WeekdayName, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export function dayLabel(day: WeekdayName | string): string {
  return DAY_LABELS[day as WeekdayName] ?? String(day);
}

let counter = 0;
export function newId(prefix = "x"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** UploadedDocument.mimeType of a roster made by the generator (there is no file behind it). */
export const GENERATED_MIME = "application/x-jnv-generated";

// ------------------------------------------------------------------ clock times
// (moved here, not time.ts, so "use client" components - like the live day-status
// card - can import them without pulling in time.ts's server-only `./config`/`node:path`)

/**
 * Parse a clock time as printed on a school routine ("8:15", "12.55", "1:30 pm").
 * School hours are 06:00-18:59, so bare hours 1-5 are read as afternoon.
 * Returns HH:MM (24h) or null.
 */
export function parseClock(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[:.;]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 23) return null;
  const mer = m[3]?.toLowerCase().replace(/\./g, "");
  if (mer === "pm" && h < 12) h += 12;
  else if (mer === "am" && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 5) h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function isClock(value: string | null | undefined): value is string {
  return !!value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function toMinutes(value: string | null | undefined): number | null {
  if (!isClock(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** "13:30" -> "1:30 PM" */
export function formatClock(value: string | null | undefined): string {
  if (!isClock(value)) return "";
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatRange(start?: string | null, end?: string | null): string {
  const a = formatClock(start);
  const b = formatClock(end);
  if (a && b) return `${a} - ${b}`;
  return a || b || "";
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Minutes since midnight, in the given IANA timezone (client-safe: no server config import). */
export function nowMinutesIn(timeZone: string, now: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

// ------------------------------------------------------------------ live day status

export type TimelineBlock = {
  id: string;
  kind: "class" | "remedial";
  label: string;
  sublabel?: string;
  start: number;
  end: number;
  startClock: string;
  endClock: string;
};

type ClassLike = { id: string; className: string; section: string; subject: string; startTime: string | null; endTime: string | null; isBreak?: boolean };
type RemedialLike = { id: string; activity: string; startTime: string | null; endTime: string | null };

/** Merges today's teaching periods and remedial/enrichment duty into one sorted timeline of occupied blocks. */
export function mergeTimeline(periods: ClassLike[], remedial: RemedialLike[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  for (const p of periods) {
    if (p.isBreak) continue;
    const start = toMinutes(p.startTime);
    const end = toMinutes(p.endTime);
    if (start == null || end == null) continue;
    blocks.push({
      id: p.id,
      kind: "class",
      label: `Class ${p.section ? `${p.className}-${p.section}` : p.className}`,
      sublabel: p.subject || undefined,
      start,
      end,
      startClock: p.startTime!,
      endClock: p.endTime!,
    });
  }
  for (const r of remedial) {
    const start = toMinutes(r.startTime);
    const end = toMinutes(r.endTime);
    if (start == null || end == null) continue;
    blocks.push({ id: r.id, kind: "remedial", label: r.activity || "Remedial/enrichment duty", start, end, startClock: r.startTime!, endClock: r.endTime! });
  }
  return blocks.sort((a, b) => a.start - b.start);
}

export type DayStatus =
  | { kind: "in-class"; block: TimelineBlock; endsInMin: number }
  | { kind: "upcoming"; block: TimelineBlock; startsInMin: number }
  | { kind: "day-done" }
  | { kind: "no-classes" };

/** Total free minutes strictly between the first and last block of a (sorted) day - not before/after the school day. */
export function sumGapMinutes(blocks: TimelineBlock[]): number {
  let total = 0;
  for (let i = 1; i < blocks.length; i++) {
    const gap = blocks[i].start - blocks[i - 1].end;
    if (gap > 0) total += gap;
  }
  return total;
}

/** What is true right now, given a sorted timeline and the current minute-of-day. Never guesses - only reads the timeline it's given. */
export function computeDayStatus(blocks: TimelineBlock[], nowMin: number): DayStatus {
  if (!blocks.length) return { kind: "no-classes" };
  const current = blocks.find((b) => nowMin >= b.start && nowMin < b.end);
  if (current) return { kind: "in-class", block: current, endsInMin: current.end - nowMin };
  const next = blocks.find((b) => b.start > nowMin);
  if (next) return { kind: "upcoming", block: next, startsInMin: next.start - nowMin };
  return { kind: "day-done" };
}
