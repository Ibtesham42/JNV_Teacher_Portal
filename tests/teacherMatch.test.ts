import { describe, expect, it } from "vitest";
import { buildTeacherIndex, resolveTeacher } from "../src/lib/extraction/teacherMatch";

const idx = buildTeacherIndex([
  { id: "1", name: "Mr. Rakesh Sharma", code: "TGT-SCI", aliases: ["R. Sharma"], active: true },
  { id: "2", name: "Mrs. Anita Devi", code: "PGT-MAT", aliases: [], active: true },
  { id: "3", name: "Mrs. Anita Deka", code: null, aliases: [], active: true },
]);

describe("teacher matching never invents teachers", () => {
  it("matches exact names ignoring honorifics/punctuation", () => {
    expect(resolveTeacher("Rakesh Sharma", idx).id).toBe("1");
    expect(resolveTeacher("MR. RAKESH  SHARMA", idx).id).toBe("1");
  });
  it("matches aliases and codes", () => {
    expect(resolveTeacher("R. Sharma", idx).id).toBe("1");
    expect(resolveTeacher("PGT-MAT", idx).id).toBe("2");
    expect(resolveTeacher("Mr. Rakesh Sharma (TGT-SCI)", idx).id).toBe("1");
  });
  it("never guesses a near match automatically", () => {
    expect(resolveTeacher("Rakesh Sharmo", idx).id).toBeNull();
    expect(resolveTeacher("TGT-SC", idx).id).toBeNull();
    // optional tolerance still exists for callers that ask for it explicitly
    expect(resolveTeacher("Rakesh Sharmo", idx, {}, { fuzzy: true })).toEqual({ id: "1", exact: false });
  });
  it("keeps PGT-ENG and TGT-ENG apart", () => {
    const i2 = buildTeacherIndex([
      { id: "p", name: "PGT-ENG", code: null, aliases: [], active: true },
      { id: "t", name: "TGT-ENG", code: null, aliases: [], active: true },
    ]);
    expect(resolveTeacher("PGT-ENG", i2).id).toBe("p");
    expect(resolveTeacher("TGT-ENG", i2).id).toBe("t");
  });
  it("leaves ambiguous or unknown names unresolved", () => {
    expect(resolveTeacher("Anita De", idx).id).toBeNull();
    expect(resolveTeacher("Somebody Else", idx).id).toBeNull();
    expect(resolveTeacher("", idx).id).toBeNull();
  });
  it("respects an explicit admin mapping", () => {
    expect(resolveTeacher("Somebody Else", idx, { "Somebody Else": "2" }).id).toBe("2");
  });
});
