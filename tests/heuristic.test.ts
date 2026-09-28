import { describe, expect, it } from "vitest";
import { heuristicExtract } from "../src/lib/extraction/heuristic";
import { splitCell } from "../src/lib/extraction/heuristic-routine";
import { lines, pageFromRows } from "./helpers";

const noTeachers: never[] = [];

describe("cell splitting", () => {
  it("splits subject and teacher", () => {
    expect(splitCell(["Science", "TGT-SCI"])).toEqual({ subject: "Science", teacher: "TGT-SCI" });
    expect(splitCell(["Science - Mr. R. Sharma"])).toEqual({ subject: "Science", teacher: "Mr. R. Sharma" });
    expect(splitCell(["Maths (PGT-MAT)"])).toEqual({ subject: "Maths", teacher: "PGT-MAT" });
    expect(splitCell(["Games"])).toEqual({ subject: "Games", teacher: "" });
    expect(splitCell(["-"])).toBeNull();
  });
});

describe("routine reader (days as columns)", () => {
  it("reads a transposed timetable where periods are rows", () => {
    const rows: [number, string][][] = [
      [[10, "CLASS VIII-A"]],
      [[10, "Period"], [100, "Monday"], [200, "Tuesday"], [300, "Wednesday"]],
      [[10, "1st 8:15-8:55"], [100, "Science"], [200, "Maths"], [300, "Hindi"]],
      [[100, "TGT-SCI"], [200, "PGT-MAT"], [300, "TGT-HIN"]],
      [[10, "2nd 8:55-9:35"], [100, "English"], [200, "Science"], [300, "Maths"]],
      [[100, "TGT-ENG"], [200, "TGT-SCI"], [300, "PGT-MAT"]],
    ];
    const d = heuristicExtract([pageFromRows(rows)], "ROUTINE", noTeachers);
    const mon1 = d.periods.find((p) => p.day === "MONDAY" && p.periodNumber === 1);
    expect(d.periods.length).toBe(6);
    expect(mon1).toMatchObject({ className: "VIII", section: "A", subject: "Science", teacherName: "TGT-SCI", startTime: "08:15", endTime: "08:55" });
    expect(d.periods.find((p) => p.day === "WEDNESDAY" && p.periodNumber === 2)).toMatchObject({ subject: "Maths", teacherName: "PGT-MAT" });
  });
});

describe("MOD / weekly off are only read when printed", () => {
  it("does not invent MOD or weekly-off from a plain timetable", () => {
    const d = heuristicExtract([lines("CLASS VI-A", "Monday Science")], "ROUTINE", noTeachers);
    expect(d.modDuties).toEqual([]);
    expect(d.weeklyOffs).toEqual([]);
  });
  it("reads dated MOD entries and skips weekday-only ones", () => {
    const d = heuristicExtract(
      [lines("MOD DUTY ROSTER", "12/03/2026 Mr. Rakesh Sharma, Mrs. Anita Devi", "Monday Mr. Someone Else", "13/03/2026 Mr. Kishor Singh")],
      "ROUTINE",
      noTeachers,
    );
    expect(d.modDuties.map((m) => [m.date, m.teacherName])).toEqual([
      ["2026-03-12", "Mr. Rakesh Sharma"],
      ["2026-03-12", "Mrs. Anita Devi"],
      ["2026-03-13", "Mr. Kishor Singh"],
    ]);
    expect(d.notes.join(" ")).toMatch(/no calendar date/);
  });
  it("reads weekly-off lists (day headings and one-line entries)", () => {
    const d = heuristicExtract(
      [lines("WEEKLY OFF", "Monday: Mr. Rakesh Sharma, Mrs. Anita Devi", "Tuesday", "Mr. Kishor Singh", "Mrs. Lily Roy - Sunday")],
      "ROUTINE",
      noTeachers,
    );
    expect(d.weeklyOffs.map((w) => [w.day, w.teacherName])).toEqual([
      ["MONDAY", "Mr. Rakesh Sharma"],
      ["MONDAY", "Mrs. Anita Devi"],
      ["TUESDAY", "Mr. Kishor Singh"],
      ["SUNDAY", "Mrs. Lily Roy"],
    ]);
  });
});

describe("remedial and club documents", () => {
  it("reads remedial rows", () => {
    const d = heuristicExtract(
      [lines("REMEDIAL SCHEDULE", "CLASS VII-A", "Monday 4:00-5:00 Maths Remedial - Mr. Rakesh Sharma", "Wednesday 4:00-5:00 English - Mrs. Anita Devi")],
      "REMEDIAL",
      noTeachers,
    );
    expect(d.remedial).toHaveLength(2);
    expect(d.remedial[0]).toMatchObject({ className: "VII", section: "A", day: "MONDAY", startTime: "16:00", endTime: "17:00", teacherName: "Mr. Rakesh Sharma" });
  });
  it("reads clubs with members and activities", () => {
    const d = heuristicExtract(
      [lines("CLUB ACTIVITIES", "1. Literary Club", "Members: Mr. Rakesh Sharma, Mrs. Anita Devi", "Activities: Debate; Quiz; Poetry recital", "2. Eco Club", "Teachers: Mr. Kishor Singh", "Activities: Tree plantation")],
      "CLUB",
      noTeachers,
    );
    expect(d.clubs.map((c) => c.name)).toEqual(["Literary Club", "Eco Club"]);
    expect(d.clubs[0].teachers).toEqual(["Mr. Rakesh Sharma", "Mrs. Anita Devi"]);
    expect(d.clubs[0].activities).toEqual(["Debate", "Quiz", "Poetry recital"]);
    expect(d.clubs[1].teachers).toEqual(["Mr. Kishor Singh"]);
  });
});
