import { newId } from "../common";
import { classRank } from "../extraction/normalize";
import type { ExtractedMod, ExtractedRemedial, ExtractedWeeklyOff } from "../extraction/schema";
import { toMinutes, weekdayOfISO, type WeekdayName } from "../time";

/**
 * Rule-based roster generator. It only ever uses the teachers it is given, never invents a name,
 * and applies the same hard rules every time, so the result has no collisions by construction:
 *   - one duty per teacher per day; never on their weekly off or compensatory off
 *   - rest days between whole-day duties (relaxed only when there are too few teachers, and reported)
 *   - duties spread evenly: nobody gets a second turn before everyone has had one
 *   - MOD and Sunday duty in the same week are avoided
 *   - remedial classes only for a teacher who teaches that class, when they are free and not off,
 *     never two at the same time, at most one per day
 * The admin still reviews, edits and publishes.
 */

export type RosterTeacher = { id: string; name: string };
export type DutyKind = "MOD" | "HOLIDAY" | "REMEDIAL";
export type Restriction = { teacherId: string; dates?: string[]; days?: WeekdayName[]; duties?: DutyKind[] };
export type RoutinePeriodLite = {
  className: string;
  section: string;
  day: WeekdayName;
  isBreak: boolean;
  subject: string;
  teacherId: string | null;
  startTime: string | null;
  endTime: string | null;
};
export type RemedialSlot = { day: WeekdayName; start: string; end: string };

export type RosterInput = {
  teachers: RosterTeacher[];
  from: string;
  to: string;
  workDays: WeekdayName[];
  holidays: string[];
  make: { mod: boolean; holiday: boolean; weeklyOff: boolean; remedial: boolean };
  modPerDay: number;
  holidayPerDay: number;
  minGapDays: number;
  restrictions: Restriction[];
  preferOff: { teacherId: string; day: WeekdayName }[];
  existingWeeklyOff: { teacherId: string; day: WeekdayName }[];
  history: { teacherId: string; date: string }[];
  periods: RoutinePeriodLite[];
  remedial: { slots: RemedialSlot[]; perWeek: number; maxPerTeacherPerWeek: number };
};

export type TeacherStat = { teacherId: string; name: string; mod: number; holiday: number; remedial: number; offDay: WeekdayName | null; compOffs: number };

export type RosterOutput = {
  modDuties: ExtractedMod[];
  weeklyOffs: ExtractedWeeklyOff[];
  remedial: ExtractedRemedial[];
  stats: TeacherStat[];
  warnings: string[];
};

// ------------------------------------------------------------------ date helpers

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
function mondayOf(iso: string): string {
  const idx = (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -idx);
}
const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

// ------------------------------------------------------------------ generator

export function generateRoster(inp: RosterInput): RosterOutput {
  const warnings: string[] = [];
  const pool = [...inp.teachers].sort((a, b) => a.name.localeCompare(b.name));
  const n = pool.length;
  const byId = new Map(pool.map((t) => [t.id, t]));
  const workDays: WeekdayName[] = inp.workDays.filter((d) => d !== "SUNDAY");
  const holidaySet = new Set(inp.holidays);

  const out: RosterOutput = { modDuties: [], weeklyOffs: [], remedial: [], stats: [], warnings };
  if (!n) {
    warnings.push("No teachers were selected.");
    return out;
  }

  const blocked = (teacherId: string, date: string, kind: DutyKind): boolean => {
    const day = weekdayOfISO(date);
    return inp.restrictions.some((r) => {
      if (r.teacherId !== teacherId) return false;
      if (r.duties && !r.duties.includes(kind)) return false;
      if (!r.dates && !r.days) return true;
      return !!r.dates?.includes(date) || !!r.days?.includes(day);
    });
  };

  // teaching load per teacher per weekday (used to put days off on the lightest day)
  const load = new Map<string, Map<WeekdayName, number>>();
  for (const p of inp.periods) {
    if (p.isBreak || !p.teacherId) continue;
    const m = load.get(p.teacherId) ?? new Map<WeekdayName, number>();
    m.set(p.day, (m.get(p.day) ?? 0) + 1);
    load.set(p.teacherId, m);
  }
  const loadOn = (id: string, day: WeekdayName) => load.get(id)?.get(day) ?? 0;

  // ---------------------------------------------------------------- 1. weekly off
  const offDay = new Map<string, WeekdayName>();
  for (const w of inp.existingWeeklyOff) offDay.set(w.teacherId, w.day);
  if (inp.make.weeklyOff) {
    if (!workDays.length) warnings.push("No working days selected, so weekly offs were not generated.");
    else {
      offDay.clear();
      const perDay = new Map<WeekdayName, number>(workDays.map((d) => [d, 0]));
      const cap = Math.ceil(n / workDays.length);
      const place = (id: string, day: WeekdayName) => {
        offDay.set(id, day);
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      };
      for (const pf of inp.preferOff) if (byId.has(pf.teacherId) && workDays.includes(pf.day) && !offDay.has(pf.teacherId)) place(pf.teacherId, pf.day);
      for (const t of pool) {
        if (offDay.has(t.id)) continue;
        const open = workDays.filter((d) => (perDay.get(d) ?? 0) < cap);
        const choices = (open.length ? open : workDays)
          .map((d, i) => ({ d, key: [loadOn(t.id, d), perDay.get(d) ?? 0, i] }))
          .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
        place(t.id, choices[0].d);
      }
    }
    for (const t of pool) {
      const d = offDay.get(t.id);
      if (d) out.weeklyOffs.push({ id: newId("w"), day: d, teacherName: t.name, confidence: null });
    }
  }

  // ---------------------------------------------------------------- 2. duty state
  const last = new Map<string, string>();
  for (const h of inp.history) if (!last.get(h.teacherId) || last.get(h.teacherId)! < h.date) last.set(h.teacherId, h.date);
  const count = new Map<string, { mod: number; hol: number }>(pool.map((t) => [t.id, { mod: 0, hol: 0 }]));
  const onDate = new Map<string, Set<string>>(); // date -> teachers with a whole-day duty
  const offDates = new Map<string, Set<string>>(); // date -> teachers on compensatory off
  const holWeeks = new Map<string, Set<string>>(); // Monday of the week -> teachers with holiday duty
  const compOffCount = new Map<string, number>();
  const warnedGap = new Set<string>();
  const compCap = Math.max(1, Math.ceil(n * 0.12));

  const isHolidayDate = (date: string) => weekdayOfISO(date) === "SUNDAY" || holidaySet.has(date);
  const dates: string[] = [];
  for (let d = inp.from, guard = 0; d <= inp.to && guard < 400; d = addDays(d, 1), guard++) dates.push(d);
  if (dates.length === 400) warnings.push("The date range is limited to 400 days.");

  const targetGap = (perDay: number) => Math.max(0, Math.min(inp.minGapDays, Math.floor(n / Math.max(1, perDay)) - 2));

  function candidates(date: string, kind: "MOD" | "HOLIDAY", gap: number): RosterTeacher[] {
    const day = weekdayOfISO(date);
    return pool.filter((t) => {
      if (blocked(t.id, date, kind)) return false;
      if (onDate.get(date)?.has(t.id)) return false;
      if (offDates.get(date)?.has(t.id)) return false;
      if (offDay.get(t.id) === day) return false;
      const l = last.get(t.id);
      return !l || daysBetween(l, date) > gap;
    });
  }

  function fill(date: string, kind: "MOD" | "HOLIDAY", need: number, dateIdx: number) {
    const tgt = targetGap(need);
    if (tgt < inp.minGapDays && !warnedGap.has(kind)) {
      warnedGap.add(kind);
      warnings.push(`Only ${n} teacher(s) for ${need} ${kind === "MOD" ? "MOD" : "holiday duty"} place(s) a day: rest days between duties are shorter than ${inp.minGapDays}. Add teachers or lower the number per day.`);
    }
    for (let slot = 0; slot < need; slot++) {
      let chosen: RosterTeacher | null = null;
      let usedGap = tgt;
      for (let gap = tgt; gap >= 0 && !chosen; gap--) {
        const cands = candidates(date, kind, gap);
        if (!cands.length) continue;
        usedGap = gap;
        const week = mondayOf(date);
        const scored = cands.map((t) => {
          const c = count.get(t.id)!;
          const own = kind === "MOD" ? c.mod : c.hol;
          const sameWeekOther = kind === "MOD" ? (holWeeks.get(week)?.has(t.id) ? 1 : 0) : 0;
          const rot = (pool.indexOf(t) + dateIdx * 7) % n;
          return { t, score: (c.mod + c.hol) * 1000 + own * 100 + sameWeekOther * 500 + rot / 1000 };
        });
        scored.sort((a, b) => a.score - b.score);
        chosen = scored[0].t;
      }
      if (!chosen) {
        warnings.push(`No teacher is available for ${kind === "MOD" ? "MOD" : "holiday duty"} on ${date}; add one by hand.`);
        continue;
      }
      if (usedGap < tgt) warnings.push(`${date}: ${chosen.name} has less than ${tgt} rest day(s) since the previous duty (not enough free teachers).`);
      const set = onDate.get(date) ?? new Set<string>();
      set.add(chosen.id);
      onDate.set(date, set);
      last.set(chosen.id, date);
      const c = count.get(chosen.id)!;
      if (kind === "MOD") c.mod++;
      else {
        c.hol++;
        const w = holWeeks.get(mondayOf(date)) ?? new Set<string>();
        w.add(chosen.id);
        holWeeks.set(mondayOf(date), w);
      }
      const duty: ExtractedMod = {
        id: newId("m"), date, teacherName: chosen.name, description: "", dutyType: kind, designation: null,
        house: null, classes: null, offDate: null, confidence: null,
      };
      if (kind === "HOLIDAY") duty.offDate = compensatoryOff(chosen, date);
      out.modDuties.push(duty);
    }
  }

  /** The teacher rests on a working day of the following week, on a day that is not already crowded. */
  function compensatoryOff(t: RosterTeacher, dutyDate: string): string | null {
    const options: { date: string; key: number[] }[] = [];
    for (let k = 1; k <= 7; k++) {
      const d = addDays(dutyDate, k);
      const day = weekdayOfISO(d);
      if (!workDays.includes(day) || holidaySet.has(d) || offDay.get(t.id) === day) continue;
      if (onDate.get(d)?.has(t.id)) continue;
      options.push({ date: d, key: [(offDates.get(d)?.size ?? 0) >= compCap ? 1 : 0, offDates.get(d)?.size ?? 0, loadOn(t.id, day), k] });
    }
    if (!options.length) {
      warnings.push(`${t.name}: no free working day found for the compensatory off after ${dutyDate}.`);
      return null;
    }
    options.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.key[3] - b.key[3]);
    const pick = options[0].date;
    const s = offDates.get(pick) ?? new Set<string>();
    s.add(t.id);
    offDates.set(pick, s);
    compOffCount.set(t.id, (compOffCount.get(t.id) ?? 0) + 1);
    return pick;
  }

  // holiday duties first (they create compensatory offs that MOD must respect), then MOD
  if (inp.make.holiday) dates.forEach((d, i) => isHolidayDate(d) && fill(d, "HOLIDAY", inp.holidayPerDay, i));
  if (inp.make.mod) dates.forEach((d, i) => !isHolidayDate(d) && workDays.includes(weekdayOfISO(d)) && fill(d, "MOD", inp.modPerDay, i));

  balanceMod();

  /**
   * Greedy picking can leave someone with two more whole-day duties than another teacher.
   * Move single MOD days to even it out, keeping the full rest gap where possible and giving up
   * rest days one at a time (never below one) only when that is the only way to even it out.
   */
  function balanceMod() {
    if (!inp.make.mod) return;
    const total = (id: string) => count.get(id)!.mod + count.get(id)!.hol;
    for (let gap = targetGap(inp.modPerDay); gap >= 1; gap--) {
      for (let guard = 0; guard < 500; guard++) {
        const order = [...pool].sort((a, b) => total(b.id) - total(a.id) || pool.indexOf(a) - pool.indexOf(b));
        const heavy = order[0];
        if (total(heavy.id) - total(order[order.length - 1].id) <= 1) return;
        let moved = false;
        for (const light of [...order].reverse()) {
          if (total(heavy.id) - total(light.id) <= 1) break;
          for (const duty of out.modDuties.filter((d) => d.teacherName === heavy.name && d.dutyType === "MOD")) {
            const day = weekdayOfISO(duty.date);
            const others = out.modDuties.filter((d) => d.teacherName === light.name).map((d) => d.date);
            const ok =
              !blocked(light.id, duty.date, "MOD") &&
              !onDate.get(duty.date)?.has(light.id) &&
              !offDates.get(duty.date)?.has(light.id) &&
              offDay.get(light.id) !== day &&
              others.every((d) => Math.abs(daysBetween(d, duty.date)) > gap);
            if (!ok) continue;
            duty.teacherName = light.name;
            onDate.get(duty.date)!.delete(heavy.id);
            onDate.get(duty.date)!.add(light.id);
            count.get(heavy.id)!.mod--;
            count.get(light.id)!.mod++;
            moved = true;
            break;
          }
          if (moved) break;
        }
        if (!moved) break;
      }
    }
  }

  // ---------------------------------------------------------------- 3. remedial (weekly pattern)
  const remedialCount = new Map<string, number>();
  if (inp.make.remedial) generateRemedial();

  function generateRemedial() {
    const slots = inp.remedial.slots
      .map((s) => ({ ...s, a: toMinutes(s.start), b: toMinutes(s.end) }))
      .filter((s): s is typeof s & { a: number; b: number } => s.a != null && s.b != null && s.a < s.b);
    if (!slots.length) return void warnings.push("No valid remedial time slots were given.");
    if (!inp.periods.some((p) => !p.isBreak && p.teacherId)) {
      return void warnings.push("Remedial classes need the current routine to know who teaches which class. Publish a routine first.");
    }
    if (inp.periods.some((p) => !p.isBreak && p.teacherId && (toMinutes(p.startTime) == null || toMinutes(p.endTime) == null))) {
      warnings.push("Some routine periods have no times, so clashes with them cannot be checked.");
    }

    const csKeys = [...new Set(inp.periods.filter((p) => !p.isBreak && p.className).map((p) => `${p.className}|${p.section}`))].sort((x, y) => {
      const [c1, s1] = x.split("|");
      const [c2, s2] = y.split("|");
      return classRank(c1) - classRank(c2) || s1.localeCompare(s2);
    });

    // who teaches what, per class-section and per class
    const teaches = new Map<string, Map<string, Map<string, number>>>(); // cs -> teacher -> subject -> periods
    const teachesClass = new Map<string, Map<string, Map<string, number>>>(); // class -> teacher -> subject -> periods
    const add = (m: Map<string, Map<string, Map<string, number>>>, key: string, t: string, subj: string) => {
      const a = m.get(key) ?? new Map();
      const b = a.get(t) ?? new Map();
      b.set(subj, (b.get(subj) ?? 0) + 1);
      a.set(t, b);
      m.set(key, a);
    };
    for (const p of inp.periods) {
      if (p.isBreak || !p.teacherId || !byId.has(p.teacherId) || !p.subject.trim()) continue;
      add(teaches, `${p.className}|${p.section}`, p.teacherId, p.subject.trim());
      add(teachesClass, p.className, p.teacherId, p.subject.trim());
    }

    // busy intervals: routine teaching, and remedial already given
    const busy = new Map<string, Map<WeekdayName, [number, number][]>>();
    const mark = (id: string, day: WeekdayName, iv: [number, number]) => {
      const m = busy.get(id) ?? new Map();
      const l = m.get(day) ?? [];
      l.push(iv);
      m.set(day, l);
      busy.set(id, m);
    };
    for (const p of inp.periods) {
      const a = toMinutes(p.startTime);
      const b = toMinutes(p.endTime);
      if (!p.isBreak && p.teacherId && a != null && b != null) mark(p.teacherId, p.day, [a, b]);
    }
    const isBusy = (id: string, day: WeekdayName, iv: [number, number]) => (busy.get(id)?.get(day) ?? []).some((x) => overlaps(x, iv));

    const perDay = new Map<string, number>(); // teacher|day -> sessions
    const csTaken = new Map<string, { day: WeekdayName; iv: [number, number] }[]>();
    const csSubjects = new Map<string, Map<string, number>>();

    for (let round = 0; round < inp.remedial.perWeek; round++) {
      for (const cs of csKeys) {
        const [className, section] = cs.split("|");
        let best: { score: number; teacher: string; subject: string; slot: (typeof slots)[number] } | null = null;
        const tiers: [Map<string, Map<string, number>> | undefined, number][] = [
          [teaches.get(cs), 0],
          [teachesClass.get(className), 1],
        ];
        for (const slot of slots) {
          const iv: [number, number] = [slot.a, slot.b];
          const taken = csTaken.get(cs) ?? [];
          if (taken.some((x) => x.day === slot.day && overlaps(x.iv, iv))) continue;
          const sameDay = taken.some((x) => x.day === slot.day) ? 1 : 0;
          for (const [map, tier] of tiers) {
            if (!map) continue;
            for (const [tid, subjects] of map) {
              if (offDay.get(tid) === slot.day) continue;
              if (inp.restrictions.some((r) => r.teacherId === tid && (!r.duties || r.duties.includes("REMEDIAL")) && (!r.dates && (!r.days || r.days.includes(slot.day))))) continue;
              if (isBusy(tid, slot.day, iv)) continue;
              if ((perDay.get(`${tid}|${slot.day}`) ?? 0) >= 1) continue;
              if ((remedialCount.get(tid) ?? 0) >= inp.remedial.maxPerTeacherPerWeek) continue;
              const [subject] = [...subjects.entries()].sort((a, b) => (csSubjects.get(cs)?.get(a[0]) ?? 0) - (csSubjects.get(cs)?.get(b[0]) ?? 0) || b[1] - a[1])[0];
              const repeat = csSubjects.get(cs)?.get(subject) ?? 0;
              const score = tier * 1000 + (remedialCount.get(tid) ?? 0) * 40 + repeat * 25 + sameDay * 40 + pool.findIndex((t) => t.id === tid) / 1000;
              if (!best || score < best.score) best = { score, teacher: tid, subject, slot };
            }
          }
        }
        if (!best) {
          warnings.push(`Remedial session ${round + 1} for class ${className}${section ? `-${section}` : ""} could not be placed (no teacher of that class is free in the given slots).`);
          continue;
        }
        const { teacher, subject, slot } = best;
        remedialCount.set(teacher, (remedialCount.get(teacher) ?? 0) + 1);
        perDay.set(`${teacher}|${slot.day}`, (perDay.get(`${teacher}|${slot.day}`) ?? 0) + 1);
        mark(teacher, slot.day, [slot.a, slot.b]);
        (csTaken.get(cs) ?? csTaken.set(cs, []).get(cs)!).push({ day: slot.day, iv: [slot.a, slot.b] });
        const sm = csSubjects.get(cs) ?? new Map<string, number>();
        sm.set(subject, (sm.get(subject) ?? 0) + 1);
        csSubjects.set(cs, sm);
        out.remedial.push({
          id: newId("r"), category: "REMEDIAL", className, section, day: slot.day, startTime: slot.start, endTime: slot.end,
          activity: `Remedial - ${subject}`, teacherName: byId.get(teacher)!.name, confidence: null,
        });
      }
    }
  }

  // ---------------------------------------------------------------- stats
  out.stats = pool.map((t) => ({
    teacherId: t.id,
    name: t.name,
    mod: count.get(t.id)!.mod,
    holiday: count.get(t.id)!.hol,
    remedial: remedialCount.get(t.id) ?? 0,
    offDay: offDay.get(t.id) ?? null,
    compOffs: compOffCount.get(t.id) ?? 0,
  }));
  const names = new Map<string, number>();
  for (const t of pool) names.set(t.name, (names.get(t.name) ?? 0) + 1);
  for (const [name, c] of names) if (c > 1) warnings.push(`Two teachers share the name "${name}"; check the teacher mapping before publishing.`);
  return out;
}
