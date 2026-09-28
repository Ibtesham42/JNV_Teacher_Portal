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
