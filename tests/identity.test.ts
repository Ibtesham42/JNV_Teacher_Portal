import { describe, expect, it } from "vitest";
import { codesEquivalent, parseTeacherText, personKey, stripSerial } from "../src/lib/teacherIdentity";

describe("teacher text from documents", () => {
  it("removes serial numbers and splits name from code", () => {
    expect(stripSerial("15 Mr. Subhashis Banerjee TGT-Maths")).toBe("Mr. Subhashis Banerjee TGT-Maths");
    expect(parseTeacherText("15 Mr. Subhashis Banerjee TGT-Maths")).toEqual({ kind: "person", name: "Mr. Subhashis Banerjee", code: "TGT-Maths", designation: null });
    expect(parseTeacherText("Mr. R.K. Tomar, TGT-English")).toEqual({ kind: "person", name: "Mr. R.K. Tomar", code: "TGT-English", designation: null });
    expect(parseTeacherText("Miss. Kriti Bala, TGT-S.SC.")).toMatchObject({ kind: "person", name: "Miss. Kriti Bala", code: "TGT-S.SC" });
    expect(parseTeacherText("Mrs. Priyanka Sharma, TGT-P.E. (F)")).toMatchObject({ name: "Mrs. Priyanka Sharma", code: "TGT-P.E.(F)" });
    expect(parseTeacherText("Mr. L. Jiten Singh, TGT-Art (MOD)")).toMatchObject({ name: "Mr. L. Jiten Singh", code: "TGT-Art" });
    expect(parseTeacherText("Mrs. Kh. Shantibala Devi, Staff Nurse")).toEqual({ kind: "person", name: "Mrs. Kh. Shantibala Devi", code: null, designation: "Staff Nurse" });
    expect(parseTeacherText("Mr. T.I. Singh")).toMatchObject({ kind: "person", name: "Mr. T.I. Singh" });
  });
  it("recognises codes", () => {
    expect(parseTeacherText("TGT-SCI")).toMatchObject({ kind: "code", code: "TGT-SCI" });
    expect(parseTeacherText("PGT-Phy")).toMatchObject({ kind: "code" });
    expect(parseTeacherText("TGT-Art ( ) Jr. Boys VI")).toMatchObject({ kind: "code", code: "TGT-Art" });
  });
  it("treats headings and sentences as noise, never as teachers", () => {
    for (const t of [
      "Ref. No", "EAST JAINTIA HILLS", "JAWAHAR NAVODAYA VIDYALAYA RYMBAI", "S.No Date Day . Designation", "Staff Nurse Sr. Girls IX",
      "27/JNV-E. JAINTIA HILLS/ Date", "Sl Date Name Allotted House Class Assigned (Supervised", "As per NVS Hq. Noida letter no. F.No 10-1/ /2016-NVS(SA)/377 dated",
      "the following Teachers are assigned duty on /Holiday Duty", "Mr. T.I. Singh also: The following Teachers are assigned as on the date given against their names w.e.f. to",
    ]) expect(parseTeacherText(t).kind).toBe("garbage");
  });
  it("gives the same key to the same person however the text looks", () => {
    const k = personKey("Mr. Subhashis Banerjee");
    expect(personKey("15 Mr. Subhashis Banerjee")).toBe(k);
    expect(personKey("MR. SUBHASHIS  BANERJEE")).toBe(k);
    expect(personKey("Mr. R. K. Tomar")).toBe(personKey("Mr. R.K. Tomar"));
    expect(personKey("Mr. R.K. Tomar")).not.toBe(personKey("Mr. T.I. Singh"));
  });
});

describe("code equivalence", () => {
  it("joins abbreviations of the same post", () => {
    for (const [a, b] of [["TGT-Maths", "TGT-MATH"], ["TGT-English", "TGT-ENG"], ["PGT-English", "PGT-ENGLISH"], ["TGT-Science", "TGT-SCI"], ["TGT-Music", "TGT-MUS"], ["TGT-Art", "TGT-ARTS"], ["PGT-Physics", "PGT-PHY."], ["TGT-C.S", "TGT-Cs"], ["TGT-P.E.(F)", "TGT-PE"], ["TGT-S.SC.", "TGT-S5C"], ["TGT-LIB", "TGT-Librarian"]])
      expect(codesEquivalent(a, b), `${a} ~ ${b}`).toBe(true);
  });
  it("never joins different posts", () => {
    for (const [a, b] of [["PGT-ENG", "TGT-ENG"], ["TGT-Maths", "TGT-Music"], ["TGT-Hindi", "PGT-Hindi"], ["TGT-SSC", "TGT-CS"]])
      expect(codesEquivalent(a, b), `${a} !~ ${b}`).toBe(false);
  });
});
