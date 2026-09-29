import { config } from "./config";

import { WEEKDAYS, dayLabel, nowMinutesIn, isClock, toMinutes, formatClock, formatRange, ordinal, parseClock, type WeekdayName } from "./common";
export { WEEKDAYS, dayLabel, isClock, toMinutes, formatClock, formatRange, ordinal, parseClock };
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
  return nowMinutesIn(config.timezone, now);
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

