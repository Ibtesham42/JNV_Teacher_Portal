import { describe, expect, it } from "vitest";
import { generateRoster, addDays, type RosterInput, type RoutinePeriodLite } from "../src/lib/roster/generate";
import { weekdayOfISO, toMinutes } from "../src/lib/time";

const names = ["Anil Kumar", "Bina Devi", "Chandan Roy", "Deepa Singh", "Eshan Khan", "Farida Ali", "Gopal Das", "Hema Nair", "Imran Sheikh", "Jaya Rao", "Kiran Bora", "Lata Pal"];
const teachers = names.map((name, i) => ({ id: `t${i}`, name }));

// class VI-A ... VII-B, 6 periods a day Mon-Sat, teacher chosen round-robin
function routine(): RoutinePeriodLite[] {
  const out: RoutinePeriodLite[] = [];
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  let k = 0;
  for (const [cn, sec] of [["VI", "A"], ["VI", "B"], ["VII", "A"], ["VII", "B"]]) {
    for (const day of days) {
      for (let p = 0; p < 6; p++) {
        const h = 8 + p;
        out.push({
          className: cn, section: sec, day, isBreak: false, subject: ["Maths", "English", "Science"][(k + p) % 3],
          teacherId: teachers[(k++ * 5) % 8].id, startTime: `${String(h).padStart(2, "0")}:00`, endTime: `${String(h).padStart(2, "0")}:40`,
        });
      }
    }
  }
  return out;
}

const base = (over: Partial<RosterInput> = {}): RosterInput => ({
  teachers,
  from: "2026-10-01",
  to: "2026-10-31",
  workDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
  holidays: [],
  make: { mod: true, holiday: true, weeklyOff: true, remedial: false },
  modPerDay: 1,
  holidayPerDay: 2,
  minGapDays: 3,
  restrictions: [],
  preferOff: [],
  existingWeeklyOff: [],
  history: [],
  periods: [],
  remedial: { slots: [], perWeek: 2, maxPerTeacherPerWeek: 4 },
  ...over,
});

describe("roster generator", () => {
  it("never puts a teacher on two duties in one day", () => {
    const r = generateRoster(base());
    const seen = new Set<string>();
    for (const d of r.modDuties) {
      const k = `${d.date}|${d.teacherName}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("uses only the teachers it was given", () => {
    const r = generateRoster(base());
    const allowed = new Set(names);
    for (const d of r.modDuties) expect(allowed.has(d.teacherName)).toBe(true);
    for (const w of r.weeklyOffs) expect(allowed.has(w.teacherName)).toBe(true);
  });

  it("covers every working day with a MOD and every Sunday with holiday duty", () => {
    const r = generateRoster(base());
    for (let d = "2026-10-01"; d <= "2026-10-31"; d = addDays(d, 1)) {
      const day = weekdayOfISO(d);
      const mod = r.modDuties.filter((x) => x.date === d && x.dutyType === "MOD").length;
      const hol = r.modDuties.filter((x) => x.date === d && x.dutyType === "HOLIDAY").length;
      expect(day === "SUNDAY" ? [mod, hol] : [mod, hol]).toEqual(day === "SUNDAY" ? [0, 2] : [1, 0]);
    }
  });

  it("does not give MOD on a teacher's weekly off or compensatory off", () => {
    const r = generateRoster(base());
    const off = new Map(r.weeklyOffs.map((w) => [w.teacherName, w.day]));
    const comp = new Set(r.modDuties.filter((d) => d.offDate).map((d) => `${d.teacherName}|${d.offDate}`));
    for (const d of r.modDuties.filter((x) => x.dutyType === "MOD")) {
      expect(off.get(d.teacherName)).not.toBe(weekdayOfISO(d.date));
      expect(comp.has(`${d.teacherName}|${d.date}`)).toBe(false);
    }
  });

  it("gives every Sunday duty a compensatory off in the following week", () => {
    const r = generateRoster(base());
    for (const d of r.modDuties.filter((x) => x.dutyType === "HOLIDAY")) {
      expect(d.offDate).not.toBeNull();
      const gap = (Date.parse(d.offDate!) - Date.parse(d.date)) / 86_400_000;
      expect(gap).toBeGreaterThanOrEqual(1);
      expect(gap).toBeLessThanOrEqual(7);
      expect(weekdayOfISO(d.offDate!)).not.toBe("SUNDAY");
    }
  });

  it("spreads duty evenly and keeps rest days between duties", () => {
    const r = generateRoster(base());
    const mod = r.stats.map((s) => s.mod + s.holiday); // all whole-day duties together
    expect(Math.max(...mod) - Math.min(...mod)).toBeLessThanOrEqual(1);
    const last = new Map<string, string>();
    for (const d of [...r.modDuties].sort((a, b) => a.date.localeCompare(b.date))) {
      const l = last.get(d.teacherName);
      if (l) expect((Date.parse(d.date) - Date.parse(l)) / 86_400_000).toBeGreaterThan(1); // at least one full rest day
      last.set(d.teacherName, d.date);
    }
    expect(r.warnings).toEqual([]);
  });

  it("spreads weekly offs across the week", () => {
    const r = generateRoster(base());
    const perDay = new Map<string, number>();
    for (const w of r.weeklyOffs) perDay.set(w.day, (perDay.get(w.day) ?? 0) + 1);
    expect(perDay.size).toBe(6);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
  });

  it("respects unavailable dates and excluded duty types", () => {
    const r = generateRoster(
      base({ restrictions: [{ teacherId: "t0", dates: ["2026-10-05", "2026-10-06"] }, { teacherId: "t1", duties: ["HOLIDAY"] }] }),
    );
    expect(r.modDuties.some((d) => d.teacherName === "Anil Kumar" && ["2026-10-05", "2026-10-06"].includes(d.date))).toBe(false);
    expect(r.modDuties.some((d) => d.teacherName === "Bina Devi" && d.dutyType === "HOLIDAY")).toBe(false);
  });

  it("is deterministic", () => {
    const strip = (r: ReturnType<typeof generateRoster>) => r.modDuties.map((d) => `${d.date}${d.dutyType}${d.teacherName}${d.offDate}`);
    expect(strip(generateRoster(base()))).toEqual(strip(generateRoster(base())));
  });

  it("warns instead of inventing when nobody is available", () => {
    const r = generateRoster(base({ teachers: teachers.slice(0, 1), make: { mod: true, holiday: false, weeklyOff: false, remedial: false } }));
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.modDuties.every((d) => d.teacherName === "Anil Kumar")).toBe(true);
  });

  describe("remedial", () => {
    const slots = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map((day) => ({ day: day as "MONDAY", start: "16:30", end: "17:30" }));
    // remedial slot that overlaps period 8 (16:00-16:40) for some teachers
    const p = routine().concat(
      ["MONDAY", "TUESDAY"].map((day) => ({ className: "VI", section: "A", day: day as "MONDAY", isBreak: false, subject: "Maths", teacherId: "t0", startTime: "16:00", endTime: "17:00" })),
    );
    const r = generateRoster(base({ make: { mod: false, holiday: false, weeklyOff: true, remedial: true }, periods: p, remedial: { slots, perWeek: 2, maxPerTeacherPerWeek: 4 } }));

    it("places sessions for every class-section", () => {
      const cs = new Set(r.remedial.map((x) => `${x.className}-${x.section}`));
      expect(cs).toEqual(new Set(["VI-A", "VI-B", "VII-A", "VII-B"]));
    });

    it("never double-books a teacher or a class", () => {
      const seen = new Set<string>();
      const cseen = new Set<string>();
      for (const x of r.remedial) {
        const k = `${x.teacherName}|${x.day}|${x.startTime}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        const c = `${x.className}${x.section}|${x.day}|${x.startTime}`;
        expect(cseen.has(c)).toBe(false);
        cseen.add(c);
      }
    });

    it("keeps to one session a day per teacher and never on their weekly off", () => {
      const off = new Map(r.weeklyOffs.map((w) => [w.teacherName, w.day]));
      const perDay = new Map<string, number>();
      for (const x of r.remedial) {
        expect(off.get(x.teacherName)).not.toBe(x.day);
        const k = `${x.teacherName}|${x.day}`;
        perDay.set(k, (perDay.get(k) ?? 0) + 1);
      }
      expect(Math.max(...perDay.values())).toBe(1);
    });

    it("only uses a teacher who teaches that class and who is not teaching at that time", () => {
      const teaches = new Map<string, Set<string>>();
      for (const q of p) if (q.teacherId) teaches.set(`${q.className}`, (teaches.get(q.className) ?? new Set()).add(q.teacherId));
      for (const x of r.remedial) {
        const t = teachers.find((y) => y.name === x.teacherName)!;
        expect(teaches.get(x.className)!.has(t.id)).toBe(true);
        const a = toMinutes(x.startTime)!;
        const b = toMinutes(x.endTime)!;
        for (const q of p.filter((y) => y.teacherId === t.id && y.day === x.day)) {
          expect(toMinutes(q.startTime)! < b && a < toMinutes(q.endTime)!).toBe(false);
        }
      }
    });

    it("says so instead of guessing when there is no routine", () => {
      const none = generateRoster(base({ make: { mod: false, holiday: false, weeklyOff: false, remedial: true }, remedial: { slots, perWeek: 2, maxPerTeacherPerWeek: 4 } }));
      expect(none.remedial).toEqual([]);
      expect(none.warnings.join(" ")).toMatch(/routine/i);
    });
  });
});

import { draftDataSchema } from "../src/lib/extraction/schema";
import { validateDraft } from "../src/lib/extraction/validate";

describe("collision warnings for hand-edited rosters", () => {
  const lite = [
    { id: "t1", name: "Mr. Sharma", code: null, aliases: [], active: true },
    { id: "t2", name: "Mrs. Devi", code: null, aliases: [], active: true },
  ];
  const mod = (date: string, teacherName: string, dutyType: "MOD" | "HOLIDAY" = "MOD") => ({ id: `${date}${teacherName}${dutyType}`, date, teacherName, dutyType });
  const codes = (d: object, routine?: Parameters<typeof validateDraft>[2]) =>
    validateDraft(draftDataSchema.parse({ kind: "OTHER", ...d }), lite, routine).issues.map((i) => i.code);

  it("flags two duties on one day, back-to-back days and MOD on a weekly off", () => {
    const c = codes({
      modDuties: [mod("2026-10-05", "Mr. Sharma"), mod("2026-10-05", "Mr. Sharma", "HOLIDAY"), mod("2026-10-06", "Mr. Sharma"), mod("2026-10-07", "Mrs. Devi")],
      weeklyOffs: [{ id: "w1", day: "WEDNESDAY", teacherName: "Mrs. Devi" }],
    });
    expect(c).toContain("dutyClash");
    expect(c).toContain("dutyBackToBack");
    expect(c).toContain("dutyOnOff");
  });

  it("flags remedial classes that overlap teaching or each other", () => {
    const routine = [{ teacherId: "t1", day: "MONDAY", isBreak: false, startTime: "16:00", endTime: "17:00" }];
    const r = (id: string, className: string) => ({ id, className, section: "A", day: "MONDAY", startTime: "16:30", endTime: "17:30", activity: "Remedial", teacherName: "Mr. Sharma" });
    const c = codes({ remedial: [r("a", "VI"), r("b", "VII")] }, routine);
    expect(c).toContain("remedialClash");
    expect(c).toContain("remedialDouble");
  });

  it("is quiet for a clean roster", () => {
    expect(codes({ modDuties: [mod("2026-10-05", "Mr. Sharma"), mod("2026-10-08", "Mrs. Devi")] })).toEqual([]);
  });
});
