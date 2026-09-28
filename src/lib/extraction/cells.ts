import { cleanCell } from "./normalize";

const CODE = "(?:TGT|PGT|PRT|PET|PPL|PAT|HM|VP|PRIN|LIB|CT)";
const TEACHER_CODE_RE = new RegExp(`\\b${CODE}\\b[\\s.\\-]*[A-Za-z][A-Za-z.\\/]{0,11}`, "i");
const TEACHERISH_RE = new RegExp(`\\b${CODE}\\b`, "i");
const HONORIFIC_RE = /\b(?:Mr|Mrs|Ms|Miss|Dr|Sri|Shri|Smt|Prof)\.?\s+[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3}/;

export const isTeacherish = (s: string) => TEACHERISH_RE.test(s) || HONORIFIC_RE.test(s);

const strip = (s: string) => {
  let t = s.replace(/^[\s\-–—/:,;|]+|[\s\-–—/:,;|]+$/g, "").replace(/\(\s*\)/g, "");
  const opens = (t.match(/\(/g) ?? []).length;
  const closes = (t.match(/\)/g) ?? []).length;
  if (opens > closes) t = t.replace(/^\(/, "");
  else if (closes > opens) t = t.replace(/\)$/, "");
  return t.replace(/\s+/g, " ").trim();
};

/** OCR turns "(" into "{" or "[" and wraps codes over lines ("(TGT-" / "ART)"). Repair that. */
export function joinWrapped(lines: string[]): string {
  return joinWrappedInfo(lines).text;
}

export function joinWrappedInfo(lines: string[]): { text: string; repaired: boolean } {
  let s = lines.map(cleanCell).filter((l) => /[A-Za-z0-9]/.test(l)).join(" ");
  s = s.replace(/[{[]/g, "(").replace(/[}\]]/g, ")");
  let opens = (s.match(/\(/g) ?? []).length;
  let closes = (s.match(/\)/g) ?? []).length;
  const repaired = opens !== closes;
  // a code whose "(" was lost by OCR:  "SCIENCE (TGT-X) PGT-Y.)"  ->  "... (PGT-Y.)"
  if (closes > opens) {
    const re = new RegExp(String.raw`(^|\s)(${CODE}\b[^()]*\))`, "gi");
    s = s.replace(re, (m, pre: string, rest: string, offset: number) => {
      const before = s.slice(0, offset + pre.length);
      const depth = (before.match(/\(/g) ?? []).length - (before.match(/\)/g) ?? []).length;
      return depth === 0 && closes > opens ? (opens++, `${pre}(${rest}`) : m;
    });
    closes = (s.match(/\)/g) ?? []).length;
  }
  if (opens > closes) s += ")".repeat(opens - closes);
  else if (closes > opens) s = "(".repeat(closes - opens) + s;
  s = s.replace(/\(([^()]*)\)/g, (_m, inner: string) => `(${inner.replace(/\s*-\s*/g, "-").replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim()})`);
  return { text: s.replace(/\s+/g, " ").trim(), repaired };
}

/** ( minus ) in a piece of text - a wrapped cell must balance to zero. */
export const parenBalance = (t: string) => (t.match(/[({[]/g) ?? []).length - (t.match(/[)}\]]/g) ?? []).length;

/** Subject/activity and teacher from the text of one timetable cell. Never invents a teacher. */
export function splitCell(rawLines: string[]): { subject: string; teacher: string; repaired?: true } | null {
  const lines = rawLines.map(cleanCell).filter((l) => /[A-Za-z0-9]/.test(l));
  if (!lines.length) return null;
  const info = joinWrappedInfo(lines);
  const r = splitJoined(lines, info.text);
  return r && info.repaired ? { ...r, repaired: true } : r;
}

function splitJoined(lines: string[], joined: string): { subject: string; teacher: string } | null {
  if (!/[A-Za-z0-9]/.test(joined.replace(/[()]/g, ""))) return null;

  // 1. teacher codes inside parentheses: "Maths (PGT-Phy)", "S.ST/ENGLISH (TGT-S.ST-2,4) (PGT-ENGLISH-1,3,5)"
  const teachers: string[] = [];
  const rest = joined.replace(/\(([^()]*)\)/g, (m, inner: string) => {
    if (isTeacherish(inner)) {
      teachers.push(inner.trim());
      return " ";
    }
    return m;
  });
  if (teachers.length) return { subject: strip(rest), teacher: teachers.join(" / ") };

  // 2. teacher on its own (last) line
  if (lines.length >= 2 && isTeacherish(lines[lines.length - 1])) {
    return { subject: strip(lines.slice(0, -1).join(" ")), teacher: strip(lines[lines.length - 1]) };
  }
  if (lines.length === 2 && isTeacherish(lines[0]) && !isTeacherish(lines[1])) {
    return { subject: strip(lines[1]), teacher: strip(lines[0]) };
  }

  // 3. "Subject TGT-XXX" / "Subject Mr. Name" on one line
  const code = joined.match(TEACHER_CODE_RE);
  if (code) return { subject: strip(joined.replace(code[0], " ")), teacher: strip(code[0]) };
  const hon = joined.match(HONORIFIC_RE);
  if (hon) return { subject: strip(joined.replace(hon[0], " ")), teacher: strip(hon[0]) };

  // 4. "Subject - Teacher" only when the right side really looks like a teacher
  const parts = joined.split(/\s+[-–—/]\s+/);
  if (parts.length === 2 && isTeacherish(parts[1])) return { subject: strip(parts[0]), teacher: strip(parts[1]) };

  return { subject: strip(joined), teacher: "" };
}
