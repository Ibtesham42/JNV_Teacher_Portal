import { normalizeKey } from "./normalize";
import type { DraftData, Issue } from "./schema";
import { toMinutes, weekdayOfISO } from "../time";

export type RoutineBusy = {
  teacherId: string | null;
  day: string;
  isBreak: boolean;
  startTime: string | null;
  endTime: string | null;
};

type Push = (scope: Issue["scope"], itemId: string | undefined, code: string, message: string) => void;

const overlap = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

/**
 * Collision checks for duty rosters and remedial timetables. They run on every edit, so a change made by
 * hand in the review screen is checked with the same rules the generator follows. All are warnings: the admin decides.
 */
export function rosterChecks(data: DraftData, resolved: Record<string, string | null>, routine: RoutineBusy[] | undefined, warn: Push) {
  const who = (name: string) => resolved[name.trim()] ?? `name:${normalizeKey(name)}`;

  // weekly off per teacher
  const offDay = new Map<string, string>();
  for (const w of data.weeklyOffs) offDay.set(who(w.teacherName), w.day);

  // whole-day duties per teacher
  const duties = new Map<string, { id: string; date: string; type: string; name: string; offDate: string | null }[]>();
  for (const m of data.modDuties) {
    const k = who(m.teacherName);
    const l = duties.get(k) ?? [];
    l.push({ id: m.id, date: m.date, type: m.dutyType, name: m.teacherName, offDate: m.offDate });
    duties.set(k, l);
  }
  const compOff = new Set<string>();
  for (const [k, list] of duties) for (const d of list) if (d.offDate) compOff.add(`${k}|${d.offDate}`);

  for (const [k, list] of duties) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i];
      const prev = sorted[i - 1];
      if (prev && prev.date === d.date) {
        warn("mod", d.id, "dutyClash", `${d.name} has two duties on ${d.date}.`);
        continue;
      }
      if (prev && (Date.parse(d.date) - Date.parse(prev.date)) / 86_400_000 === 1) {
        warn("mod", d.id, "dutyBackToBack", `${d.name} has duty on consecutive days (${prev.date} and ${d.date}).`);
      }
      const day = weekdayOfISO(d.date);
      if (offDay.get(k) === day && d.type === "MOD") warn("mod", d.id, "dutyOnOff", `${d.name} has MOD on ${d.date}, which is their weekly off (${day.toLowerCase()}).`);
      if (compOff.has(`${k}|${d.date}`)) warn("mod", d.id, "dutyOnCompOff", `${d.name} has duty on ${d.date}, which is their compensatory off.`);
    }
  }

  // several MODs on the same day is unusual (usually one)
  const modPerDate = new Map<string, number>();
  for (const m of data.modDuties) if (m.dutyType === "MOD") modPerDate.set(m.date, (modPerDate.get(m.date) ?? 0) + 1);
  const seen = new Set<string>();
  for (const m of data.modDuties) {
    if (m.dutyType === "MOD" && (modPerDate.get(m.date) ?? 0) > 1 && !seen.has(m.date)) {
      seen.add(m.date);
      warn("mod", m.id, "manyMod", `${modPerDate.get(m.date)} teachers are marked MOD on ${m.date}.`);
    }
  }

  // remedial: a teacher cannot be in two places, on a day off, or teaching
  const rem = data.remedial.filter((r) => r.teacherName.trim() && r.day && toMinutes(r.startTime) != null && toMinutes(r.endTime) != null);
  const busyRoutine = new Map<string, [number, number][]>();
  for (const p of routine ?? []) {
    const a = toMinutes(p.startTime);
    const b = toMinutes(p.endTime);
    if (p.isBreak || !p.teacherId || a == null || b == null) continue;
    const key = `${p.teacherId}|${p.day}`;
    busyRoutine.set(key, [...(busyRoutine.get(key) ?? []), [a, b]]);
  }
  for (let i = 0; i < rem.length; i++) {
    const r = rem[i];
    const k = who(r.teacherName);
    const iv: [number, number] = [toMinutes(r.startTime)!, toMinutes(r.endTime)!];
    const label = `${r.className}${r.section ? `-${r.section}` : ""} (${r.day!.toLowerCase()})`;
    if (offDay.get(k) === r.day) warn("remedial", r.id, "remedialOnOff", `${r.teacherName} takes ${label} on their weekly off.`);
    if ((busyRoutine.get(`${k}|${r.day}`) ?? []).some((x) => overlap(x, iv))) {
      warn("remedial", r.id, "remedialClash", `${r.teacherName} is teaching in the routine at the time of ${label}.`);
    }
    for (let j = i + 1; j < rem.length; j++) {
      const o = rem[j];
      if (who(o.teacherName) === k && o.day === r.day && overlap(iv, [toMinutes(o.startTime)!, toMinutes(o.endTime)!])) {
        warn("remedial", o.id, "remedialDouble", `${o.teacherName} is booked for two remedial classes at the same time on ${r.day!.toLowerCase()}.`);
      }
    }
  }
}
