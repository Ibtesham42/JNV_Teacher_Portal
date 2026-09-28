import { config } from "./config";

import { WEEKDAYS, dayLabel, type WeekdayName } from "./common";
export { WEEKDAYS, dayLabel };
export type { WeekdayName };

/** Today's calendar date (YYYY-MM-DD) in the school's timezone. */
export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA => YYYY-MM-DD
}

/** Date stored in a @db.Date column (UTC midnight of the calendar date). */
export function dateFromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekdayOfISO(iso: string): WeekdayName {
  const d = dateFromISO(iso);
  const idx = (d.getUTCDay() + 6) % 7; // Monday=0
  return WEEKDAYS[idx];
}

export function todayWeekday(now: Date = new Date()): WeekdayName {
  return weekdayOfISO(todayISO(now));
}

export function nowMinutes(now: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function greeting(now: Date = new Date()): string {
  const h = Math.floor(nowMinutes(now) / 60);
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export function formatDateLong(iso: string): string {
  const d = dateFromISO(iso);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateShort(iso: string): string {
  const d = dateFromISO(iso);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

// ------------------------------------------------------------------ clock times

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
