import { describe, expect, it } from "vitest";
import {
  findDate, findDayInText, guessSession, normalizeClassName, normalizeDay, normalizeSection, parseTimeRange, periodNumberFrom,
} from "../src/lib/extraction/normalize";
import { parseClock, todayISO, weekdayOfISO } from "../src/lib/time";

describe("clock parsing", () => {
  it("reads school times without am/pm", () => {
    expect(parseClock("8:15")).toBe("08:15");
    expect(parseClock("12:55")).toBe("12:55");
    expect(parseClock("1:30")).toBe("13:30");
    expect(parseClock("11.45")).toBe("11:45");
    expect(parseClock("1:30 pm")).toBe("13:30");
    expect(parseClock("25:00")).toBeNull();
  });
  it("reads time ranges", () => {
    expect(parseTimeRange("8:15-8:55")).toEqual({ start: "08:15", end: "08:55" });
    expect(parseTimeRange("12:55 – 1:30")).toEqual({ start: "12:55", end: "13:30" });
    expect(parseTimeRange("10.15 to 10.55")).toEqual({ start: "10:15", end: "10:55" });
    expect(parseTimeRange("nothing")).toBeNull();
  });
});

describe("class / section / day", () => {
  it("normalises class names", () => {
    expect(normalizeClassName("Class VI")).toBe("VI");
    expect(normalizeClassName("CLASS - VII")).toBe("VII");
    expect(normalizeClassName("8th")).toBe("VIII");
    expect(normalizeClassName("10")).toBe("X");
    expect(normalizeClassName("banana")).toBeNull();
  });
  it("normalises sections and days", () => {
    expect(normalizeSection("a")).toBe("A");
    expect(normalizeSection(undefined)).toBe("");
    expect(normalizeDay("Mon")).toBe("MONDAY");
    expect(normalizeDay("THURS.")).toBe("THURSDAY");
    expect(findDayInText("Weekly off: Saturday")).toBe("SATURDAY");
  });
  it("reads period labels", () => {
    expect(periodNumberFrom("3rd")).toBe(3);
    expect(periodNumberFrom("P-5")).toBe(5);
    expect(periodNumberFrom("IV")).toBe(4);
  });
});

describe("dates", () => {
  it("finds calendar dates", () => {
    expect(findDate("MOD on 12/03/2026 Mr. X")).toBe("2026-03-12");
    expect(findDate("05-08-26")).toBe("2026-08-05");
    expect(findDate("12 March 2026")).toBe("2026-03-12");
    expect(findDate("31/02/2026")).toBeNull();
    expect(findDate("no date")).toBeNull();
  });
  it("guesses the session", () => {
    expect(guessSession("SESSION 2025-26")).toBe("2025-26");
    expect(guessSession("2025 - 2026")).toBe("2025-26");
  });
  it("computes weekday and today in the school timezone", () => {
    expect(weekdayOfISO("2026-09-28")).toBe("MONDAY");
    expect(weekdayOfISO("2026-09-27")).toBe("SUNDAY");
    // 19:00 UTC on Sunday is already Monday 00:30 in Asia/Kolkata
    expect(todayISO(new Date("2026-09-27T19:00:00Z"))).toBe("2026-09-28");
  });
});
