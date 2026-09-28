import { describe, expect, it } from "vitest";
import { draftDataSchema, type DraftData } from "../src/lib/extraction/schema";
import { validateDraft } from "../src/lib/extraction/validate";

const teachers = [
  { id: "t1", name: "Mr. Sharma", code: null, aliases: [], active: true },
  { id: "t2", name: "Mrs. Devi", code: null, aliases: [], active: true },
];

const period = (o: Partial<DraftData["periods"][number]> = {}) => ({
  id: Math.random().toString(36).slice(2),
  className: "VI",
  section: "A",
  day: "MONDAY" as const,
  slot: 0,
  periodNumber: 1,
  isBreak: false,
  label: null,
  startTime: "08:15",
  endTime: "08:55",
  subject: "Science",
  teacherName: "Mr. Sharma",
  room: null,
  confidence: 0.95,
  ...o,
});

const draft = (periods: ReturnType<typeof period>[], extra: Partial<DraftData> = {}) =>
  draftDataSchema.parse({ kind: "ROUTINE", periods, ...extra });

const codes = (d: DraftData) => validateDraft(d, teachers).issues.map((i) => i.code);

describe("deterministic validation", () => {
  it("accepts a clean routine", () => {
    const v = validateDraft(draft([period(), period({ slot: 1, periodNumber: 2, startTime: "08:55", endTime: "09:35", teacherName: "Mrs. Devi" })]), teachers);
    expect(v.errors).toBe(0);
    expect(v.canPublish).toBe(true);
  });
  it("rejects invalid class, section, period, day/time order", () => {
    expect(codes(draft([period({ className: "XV" })]))).toContain("class");
    expect(codes(draft([period({ section: "Z" })]))).toContain("section");
    expect(codes(draft([period({ periodNumber: 27 })]))).toContain("periodNumber");
    expect(codes(draft([period({ startTime: "09:00", endTime: "08:00" })]))).toContain("timeOrder");
  });
  it("rejects duplicate cells", () => {
    expect(codes(draft([period(), period()]))).toContain("duplicate");
  });
  it("blocks unknown teachers until matched or created", () => {
    const d = draft([period({ teacherName: "Nobody" })]);
    const v = validateDraft(d, teachers);
    expect(v.canPublish).toBe(false);
    expect(v.unresolvedTeachers).toEqual(["Nobody"]);
    d.teacherMap["Nobody"] = "NEW";
    expect(validateDraft(d, teachers).canPublish).toBe(true);
    d.teacherMap["Nobody"] = "t2";
    expect(validateDraft(d, teachers).resolved["Nobody"]).toBe("t2");
  });
  it("flags low confidence, overlaps, near-misses and teacher clashes as warnings", () => {
    const v = validateDraft(
      draft([
        period({ confidence: 0.4 }),
        period({ slot: 1, periodNumber: 2, startTime: "08:56", endTime: "09:35", teacherName: "Mrs. Devi" }),
        period({ section: "B", teacherName: "Mr. Sharma" }), // same teacher, same time, other class
      ]),
      teachers,
    );
    const c = v.issues.map((i) => i.code);
    expect(c).toContain("lowConfidence");
    expect(c).toContain("timeGap");
    expect(c).toContain("teacherClash");
    expect(v.errors).toBe(0);
  });
  it("errors when nothing was extracted", () => {
    expect(codes(draft([]))).toContain("empty");
  });
  it("validates MOD and weekly-off entries", () => {
    const d = draft([], {
      modDuties: [
        { id: "m1", date: "2026-03-12", teacherName: "Mr. Sharma", description: "", dutyType: "MOD" as const, designation: null, house: null, classes: null, offDate: null, confidence: 0.9 },
        { id: "m2", date: "2026-03-12", teacherName: "Mr. Sharma", description: "", dutyType: "MOD" as const, designation: null, house: null, classes: null, offDate: null, confidence: 0.9 },
      ],
      weeklyOffs: [{ id: "w1", day: "SUNDAY", teacherName: "Ghost", confidence: 0.9 }],
    });
    const c = codes(d);
    expect(c).toContain("duplicate");
    expect(c).toContain("teacherUnknown");
  });
});
