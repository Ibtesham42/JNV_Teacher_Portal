// Pure helpers that decide what a piece of text from a document is: a person, a teacher code, or noise.
// No database, no server imports - used by extraction, validation, publishing and the clean-up tool.

const HON = "(?:Mr|Mrs|Ms|Miss|Dr|Sri|Shri|Smt|Prof)";
const CODE = "(?:TGT|PGT|PRT|PET|PPL|PAT|HM|VP)";
const HON_START = new RegExp(`^${HON}\\b\\.?\\s*`, "i");
const CODE_START = new RegExp(`^${CODE}\\b`, "i");
const CODE_ANYWHERE = new RegExp(`(?:^|[\\s,(\\-–])(${CODE}\\b[\\s.\\-]*[A-Za-z0-9][A-Za-z0-9.\\/()]*(?:\\s?\\((?:F|M)\\))?)`, "i");
const DESIGNATION_WORDS = /\b(Staff\s+Nurse|Librarian|Principal|Vice\s*Principal|Counsell?or|Warden|Matron|Nurse)\b/i;
const HOUSE_WORDS = /\b(Boys|Girls|House)\b/i;

/** Remove a leading serial number: "15 Mr. X", "1. Mr. X", "27) Mr. X". */
export function stripSerial(s: string): string {
  return s.replace(/^\s*\d{1,3}\s*[.):\-]?\s+(?=[A-Za-z])/, "").trim();
}

export function cleanSpaces(s: string): string {
  return s.replace(/[|¦]+/g, " ").replace(/\s+/g, " ").trim();
}

/** "TGT-S.SC." -> "TGT-S.SC", "TGT-P.E. (F)" -> "TGT-P.E.(F)" */
export function cleanCode(code: string): string {
  return cleanSpaces(code).replace(/\s*\(\s*(F|M)\s*\)/i, "($1)").replace(/[.,;:\s]+$/, "").replace(/\(\s*\)/g, "").trim();
}

export type ParsedTeacher =
  | { kind: "person"; name: string; code: string | null; designation: string | null }
  | { kind: "code"; name: string; code: string }
  | { kind: "garbage"; name: string };

/**
 * Classifies text found in a document.
 *   "15 Mr. Subhashis Banerjee TGT-Maths"  -> person "Mr. Subhashis Banerjee", code "TGT-Maths"
 *   "Mr. R.K. Tomar, TGT-English"           -> person "Mr. R.K. Tomar", code "TGT-English"
 *   "TGT-SCI"                               -> code
 *   "TGT-Art ( ) Jr. Boys VI"               -> code "TGT-Art" (house text dropped)
 *   "Ref. No", "EAST JAINTIA HILLS", ...    -> garbage
 */
export function parseTeacherText(raw: string): ParsedTeacher {
  const t = stripSerial(cleanSpaces(raw));
  if (!t) return { kind: "garbage", name: "" };

  if (HON_START.test(t)) {
    // split "<name> [, ] <code or designation>"
    let namePart = t;
    let code: string | null = null;
    let designation: string | null = null;
    const m = t.match(CODE_ANYWHERE);
    if (m && m.index != null) {
      const at = t.indexOf(m[1], m.index);
      namePart = t.slice(0, at);
      code = cleanCode(m[1]);
    } else {
      const d = t.match(DESIGNATION_WORDS);
      if (d && d.index != null && d.index > 3) {
        namePart = t.slice(0, d.index);
        designation = cleanSpaces(d[0]);
      }
    }
    namePart = namePart.replace(/[,\-–(\s]+$/, "").replace(/\(\s*MOD\s*\)/i, "").trim();
    const tokens = namePart.replace(HON_START, "").split(/\s+/).filter(Boolean);
    const nameLike = tokens.length >= 1 && tokens.length <= 6 && tokens.every((w) => /^[A-Za-z][A-Za-z.'’\-]*$/.test(w)) && !HOUSE_WORDS.test(namePart);
    if (!nameLike) return { kind: "garbage", name: t };
    return { kind: "person", name: namePart, code, designation };
  }

  if (CODE_START.test(t)) {
    const m = t.match(CODE_ANYWHERE);
    const code = m ? cleanCode(m[1]) : cleanCode(t.split(/\s+/)[0]);
    // "TGT-Art ( ) Jr. Boys VI": only the leading code matters; a slash-joined double code stays as printed
    const compact = /^[A-Za-z0-9.\-\/(), ]{2,40}$/.test(t) && !HOUSE_WORDS.test(t) && !/\bdate\b/i.test(t);
    return { kind: "code", name: compact ? cleanCode(t) : code, code: compact ? cleanCode(t) : code };
  }
  return { kind: "garbage", name: t };
}

/** Text that may become a teacher record: a real person or a teacher code. */
export function isTeacherLike(raw: string): boolean {
  return parseTeacherText(raw).kind !== "garbage";
}

/** Key that ignores honorifics, serial numbers, punctuation and case: "15 Mr. R.K. Tomar" == "Mr. R. K. Tomar". */
export function personKey(name: string): string {
  return stripSerial(cleanSpaces(name))
    .replace(HON_START, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ------------------------------------------------------------------ codes

export type CodeParts = { prefix: string; stem: string };

/** TGT-Maths / TGT-MATH / TGT-MATHS all describe the same post; PGT-ENG and TGT-ENG do not. */
export function codeParts(code: string): CodeParts | null {
  const c = code
    .toUpperCase()
    .replace(/\(\s*[FM]\s*\)/g, "")
    .replace(/5/g, "S")
    .replace(/0/g, "O")
    .replace(/[^A-Z]/g, "");
  const m = c.match(new RegExp(`^(${CODE})(.*)$`));
  if (!m) return null;
  return { prefix: m[1], stem: m[2] };
}

export function codesEquivalent(a: string, b: string): boolean {
  const x = codeParts(a);
  const y = codeParts(b);
  if (!x || !y || x.prefix !== y.prefix) return false;
  if (x.stem === y.stem) return true;
  const [s, l] = x.stem.length <= y.stem.length ? [x.stem, y.stem] : [y.stem, x.stem];
  return s.length >= 2 && l.startsWith(s); // ENG/ENGLISH, MATH/MATHS, SCI/SCIENCE, MUS/MUSIC, ART/ARTS, PHY/PHYSICS, LIB/LIBRARIAN
}
