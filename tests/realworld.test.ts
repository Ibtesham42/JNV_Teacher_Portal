import { describe, expect, it } from "vitest";
import { splitCell } from "../src/lib/extraction/cells";
import { detectColumns, findHeading, ordinalFromToken } from "../src/lib/extraction/heuristic-routine";
import { buildLines } from "../src/lib/extraction/layout";
import { normalizeClassName } from "../src/lib/extraction/normalize";
import { buildGrid, parseClassLabel, parseRemedialMatrix } from "../src/lib/extraction/tables";
import type { PageContent, Word } from "../src/lib/extraction/types";
import { validateDraft } from "../src/lib/extraction/validate";
import { mergeOcrVariants } from "../src/lib/extraction/groq";
import { draftDataSchema } from "../src/lib/extraction/schema";
import { lines, pageFromRows } from "./helpers";

describe("cells as printed in real JNV routines", () => {
  it("reads teacher codes in brackets, also when wrapped over lines", () => {
    expect(splitCell(["Maths (PGT-Phy)"])).toEqual({ subject: "Maths", teacher: "PGT-Phy" });
    expect(splitCell(["Handicraft (TGT-", "ART)"])).toEqual({ subject: "Handicraft", teacher: "TGT-ART" });
    expect(splitCell(["Art/Music (TGT-", "ART/MUS)"])).toEqual({ subject: "Art/Music", teacher: "TGT-ART/MUS" });
    expect(splitCell(["Science GLP ACT (TGT-SCI)"])).toEqual({ subject: "Science GLP ACT", teacher: "TGT-SCI" });
    expect(splitCell(["MUSIC (VOCAL/", "INSTRUMENTAL)", "(TGT-MUSIC)"])).toEqual({ subject: "MUSIC (VOCAL/INSTRUMENTAL)", teacher: "TGT-MUSIC" });
  });
  it("repairs OCR bracket noise and flags cells it had to repair", () => {
    expect(splitCell(["S.Sc {TGT-S.SC)"])).toEqual({ subject: "S.Sc", teacher: "TGT-S.SC" }); // "{" read for "(": harmless
    expect(splitCell(["ART)"])?.repaired).toBe(true); // a lone closing bracket: text was cut between rows
    expect(splitCell(["Science (TGT-SCI)", "PGT-PHY.-1,3,5)"])?.repaired).toBe(true);
  });
  it("keeps several codes of one cell", () => {
    expect(splitCell(["S.ST/ENGLISH", "(TGT-S.ST-2,4)", "(PGT-ENGLISH-1,3,5)"])).toEqual({
      subject: "S.ST/ENGLISH",
      teacher: "TGT-S.ST-2,4 / PGT-ENGLISH-1,3,5",
    });
  });
  it("does not split plain two-word subjects", () => {
    expect(splitCell(["Kausal", "Bodh"])).toEqual({ subject: "Kausal Bodh", teacher: "" });
  });
});

describe("headings and labels as OCR reads them", () => {
  const heading = (t: string) => findHeading(buildLines(lines(t).words)[0]);
  it("reads CLASS- VI, 'A' style headings", () => {
    expect(heading("CLASS- VI, 'A'")).toEqual({ className: "VI", section: "A" });
    expect(heading("CLASS- VI, 'B'")).toEqual({ className: "VI", section: "B" });
    expect(heading("CLASS- VII")).toEqual({ className: "VII", section: "" });
    expect(heading("CLASS- Vill")).toEqual({ className: "VIII", section: "" });
    expect(heading("CLASS - X")).toEqual({ className: "X", section: "" });
  });
  it("does not mistake other lines for headings", () => {
    expect(heading("TIME TABLE ACADEMIC SESSION - 2026-27")).toBeNull();
  });
  it("normalises OCR roman numerals", () => {
    expect(normalizeClassName("Vill")).toBe("VIII");
    expect(normalizeClassName("vil")).toBe("VII");
    expect(parseClassLabel("VIA")).toEqual({ className: "VI", section: "A" });
    expect(parseClassLabel("viii")).toEqual({ className: "VIII", section: "" });
    expect(parseClassLabel("IX")).toEqual({ className: "IX", section: "" });
    expect(parseClassLabel("")).toBeNull();
  });
  it("reads period labels misread by OCR", () => {
    expect(ordinalFromToken("ist")).toBe(1);
    expect(ordinalFromToken("Sth")).toBe(5);
    expect(ordinalFromToken("2nd")).toBe(2);
    expect(ordinalFromToken("word")).toBeNull();
  });
});

describe("columns", () => {
  it("uses the printed time ranges and adds the unreadable break from the gap", () => {
    const page = pageFromRows([
      [[100, "1st"], [230, "2nd"], [360, "3rd"], [490, "4th"], [680, "5th"], [810, "6th"]],
      [[100, "(8:15-8:55)"], [230, "(8:55-9:35)"], [360, "(9:35-10:15)"], [490, "(10:15-10:55)"], [680, "(11:10-11:45)"], [810, "(11:45-12:20)"]],
    ]);
    const cols = detectColumns(buildLines(page.words));
    expect(cols.map((c) => (c.isBreak ? "B" : c.number))).toEqual([1, 2, 3, 4, "B", 5, 6]);
    expect(cols[4]).toMatchObject({ start: "10:55", end: "11:10", inferred: true });
  });
});

describe("remedial matrix with merged cells", () => {
  // 1 class column + Monday(2 sessions) + Tuesday(2 sessions); classes as rows
  const W = (text: string, x: number, y: number): Word => ({ text, x0: x, x1: x + text.length * 8, y0: y - 6, y1: y + 6, conf: 90 });
  const page: PageContent = {
    pageNumber: 1, width: 1000, height: 600, source: "ocr", meanConf: 90,
    words: [
      W("MONDAY", 250, 120), W("TUESDAY", 600, 120),
      W("03:00 PM TO 3:45 PM", 180, 165), W("03:45 PM TO 4:30 PM", 340, 165), W("03:00 PM TO 3:45 PM", 530, 165), W("03:45 PM TO 4:30 PM", 690, 165),
      W("VIA", 50, 260), W("MUSIC (TGT-MUSIC)", 200, 260), W("DANCE (TGT-DANCE)", 360, 260), W("KHAN ACADEMY (TGT-MATHS)", 560, 260),
      W("VIB", 50, 360), W("RKM (TGT-ARTS)", 200, 360), W("IKS (TGT-CS)", 380, 360), W("LAB (TGT-HINDI)", 560, 360), W("CRAFT (TGT-ARTS)", 720, 360),
    ],
    rules: {
      width: 1000, height: 600,
      h: [100, 140, 190, 320, 400].map((y) => ({ y, x0: 30, x1: 900, m: 0 })),
      v: [
        { x: 30, y0: 100, y1: 400 }, { x: 160, y0: 100, y1: 400 }, { x: 900, y0: 100, y1: 400 },
        { x: 320, y0: 140, y1: 400 }, { x: 510, y0: 100, y1: 400 }, { x: 670, y0: 140, y1: 190 }, { x: 670, y0: 320, y1: 400 },
        // Tuesday of row VIA is merged: no divider at 670 between y=190 and y=320
      ],
    },
  };
  it("builds cells that span merged columns", () => {
    const g = buildGrid(page)!;
    expect(g.rows.length).toBe(4);
    const viaRow = g.rows[2];
    expect(viaRow.cells.map((c) => c.text)).toEqual(["VIA", "MUSIC (TGT-MUSIC)", "DANCE (TGT-DANCE)", "KHAN ACADEMY (TGT-MATHS)"]);
  });
  it("turns a merged cell into one full-length entry and separate cells into two", () => {
    const r = parseRemedialMatrix(page, "Remedial Schedule Life Skill/ Enrichment Activities : For Class VI to X")!;
    const via = r.items.filter((i) => i.className === "VI" && i.section === "A");
    expect(via.map((i) => [i.day, i.startTime, i.endTime, i.activity, i.teacherName])).toEqual([
      ["MONDAY", "15:00", "15:45", "MUSIC", "TGT-MUSIC"],
      ["MONDAY", "15:45", "16:30", "DANCE", "TGT-DANCE"],
      ["TUESDAY", "15:00", "16:30", "KHAN ACADEMY", "TGT-MATHS"],
    ]);
    expect(r.items.filter((i) => i.section === "B")).toHaveLength(4);
    expect(r.items[0].category).toBe("OTHER"); // heading mentions several kinds
  });
});

describe("teacher-name suggestions", () => {
  it("suggests the common spelling for a one-off OCR misreading", () => {
    const mk = (id: string, name: string, slot: number, day: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY") => ({
      id, className: "VI", section: "A", day, slot, periodNumber: slot + 1, isBreak: false, label: null,
      startTime: null, endTime: null, subject: "S.Sc", teacherName: name, room: null, confidence: 0.9,
    });
    const d = draftDataSchema.parse({
      kind: "ROUTINE",
      periods: [mk("a", "TGT-S.SC", 0, "MONDAY"), mk("b", "TGT-S.SC", 0, "TUESDAY"), mk("c", "TGT-S.SC", 0, "WEDNESDAY"), mk("d", "TGT-S.SC", 0, "THURSDAY"), mk("e", "TGT-5.5C", 0, "FRIDAY")],
    });
    const v = validateDraft(d, []);
    expect(v.suggestions["TGT-5.5C"]).toBe("TGT-S.SC");
    expect(v.suggestions["TGT-S.SC"]).toBeUndefined();
  });
});

describe("deterministic OCR-variant merge", () => {
  const mk = (id: string, subject: string, teacherName: string, slot: number) => ({
    id, className: "VI", section: "A", day: "MONDAY" as const, slot, periodNumber: slot + 1, isBreak: false, label: null,
    startTime: null, endTime: null, subject, teacherName, room: null, confidence: 0.9,
  });
  it("merges look-alike spellings but never different codes", () => {
    const d = draftDataSchema.parse({
      kind: "ROUTINE",
      periods: [
        mk("1", "S.Sc", "TGT-S.SC", 0), mk("2", "S.Sc", "TGT-S.SC", 1), mk("3", "S$.Sc", "TGT-5.5C", 2), mk("4", "5.5c", "TGT-55C", 3),
        mk("5", "Eng", "PGT-ENG", 4), mk("6", "Eng", "TGT-ENG", 5), mk("7", "Maths", "TGT-MATH", 6), mk("8", "Maths", "TGT-MATHS", 7),
      ],
    });
    const { draft, changes } = mergeOcrVariants(d);
    expect(changes).toBeGreaterThan(0);
    expect(draft.periods.map((p) => p.teacherName)).toEqual(["TGT-S.SC", "TGT-S.SC", "TGT-S.SC", "TGT-S.SC", "PGT-ENG", "TGT-ENG", "TGT-MATH", "TGT-MATHS"]);
    expect(draft.periods.slice(0, 4).map((p) => p.subject)).toEqual(["S.Sc", "S.Sc", "S.Sc", "S.Sc"]);
    expect(draft.periods[2].confidence).toBeLessThanOrEqual(0.85);
    expect(draft.periods[0].confidence).toBe(0.9); // untouched cells keep their score
  });
});
