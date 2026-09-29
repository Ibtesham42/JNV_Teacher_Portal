import { classLabel, type PeriodRow } from "./queries";
import { classRank } from "./extraction/normalize";
import { dayLabel, formatRange } from "./time";
import { WEEKDAYS } from "./common";

export type PeriodDiff =
  | { kind: "added"; className: string; section: string; day: string; slot: number; period: PeriodRow }
  | { kind: "removed"; className: string; section: string; day: string; slot: number; period: PeriodRow }
  | { kind: "changed"; className: string; section: string; day: string; slot: number; before: PeriodRow; after: PeriodRow };

const keyOf = (p: PeriodRow) => `${p.className}|${p.section}|${p.day}|${p.slot}`;

/** Compares two routine versions' periods slot-by-slot. Breaks are ignored (only teaching periods matter for "what changed"). */
export function diffPeriods(oldPeriods: PeriodRow[], newPeriods: PeriodRow[]): PeriodDiff[] {
  const oldMap = new Map(oldPeriods.filter((p) => !p.isBreak).map((p) => [keyOf(p), p]));
  const newMap = new Map(newPeriods.filter((p) => !p.isBreak).map((p) => [keyOf(p), p]));
  const diffs: PeriodDiff[] = [];

  for (const [key, after] of newMap) {
    const before = oldMap.get(key);
    if (!before) {
      diffs.push({ kind: "added", className: after.className, section: after.section, day: after.day, slot: after.slot, period: after });
    } else if (before.subject !== after.subject || before.teacherId !== after.teacherId || before.startTime !== after.startTime || before.endTime !== after.endTime) {
      diffs.push({ kind: "changed", className: after.className, section: after.section, day: after.day, slot: after.slot, before, after });
    }
  }
  for (const [key, before] of oldMap) {
    if (!newMap.has(key)) {
      diffs.push({ kind: "removed", className: before.className, section: before.section, day: before.day, slot: before.slot, period: before });
    }
  }

  const dayRank = (d: string) => WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number]);
  return diffs.sort(
    (a, b) =>
      classRank(a.className) - classRank(b.className) ||
      a.section.localeCompare(b.section) ||
      dayRank(a.day) - dayRank(b.day) ||
      a.slot - b.slot,
  );
}

/** True only for diffs that involve this teacher on either side (their class changed, or they were added/removed from a slot). */
export function affectsTeacher(diff: PeriodDiff, teacherId: string): boolean {
  if (diff.kind === "added") return diff.period.teacherId === teacherId;
  if (diff.kind === "removed") return diff.period.teacherId === teacherId;
  return diff.before.teacherId === teacherId || diff.after.teacherId === teacherId;
}

/** One line describing a diff entry, e.g. "Monday, Period 3 - Class VII-A: Computer Science, Mr. XYZ". */
export function describeSlot(d: { className: string; section: string; day: string }): string {
  return `${dayLabel(d.day)} - Class ${classLabel(d.className, d.section)}`;
}

export function describePeriod(p: PeriodRow): string {
  const time = formatRange(p.startTime, p.endTime);
  return [p.subject || "(no subject)", p.teacherName || "(no teacher)", time].filter(Boolean).join(" · ");
}
