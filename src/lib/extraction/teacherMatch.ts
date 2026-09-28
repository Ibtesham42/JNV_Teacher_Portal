import { normalizeKey } from "./normalize";
import { parseTeacherText } from "../teacherIdentity";

export type TeacherLite = {
  id: string;
  name: string;
  code: string | null;
  aliases: string[];
  active: boolean;
};

export type TeacherIndex = {
  byName: Map<string, string[]>;
  byCode: Map<string, string[]>;
  keys: { key: string; id: string }[];
  ids: Set<string>;
};

function push(map: Map<string, string[]>, key: string, id: string) {
  if (!key) return;
  const arr = map.get(key) ?? [];
  if (!arr.includes(id)) arr.push(id);
  map.set(key, arr);
}

export function buildTeacherIndex(teachers: TeacherLite[]): TeacherIndex {
  const byName = new Map<string, string[]>();
  const byCode = new Map<string, string[]>();
  const keys: { key: string; id: string }[] = [];
  for (const t of teachers) {
    const nk = normalizeKey(t.name);
    push(byName, nk, t.id);
    keys.push({ key: nk, id: t.id });
    for (const a of t.aliases) {
      const ak = normalizeKey(a);
      push(byName, ak, t.id);
      keys.push({ key: ak, id: t.id });
    }
    if (t.code) push(byCode, normalizeKey(t.code), t.id);
  }
  return { byName, byCode, keys, ids: new Set(teachers.map((t) => t.id)) };
}

export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export type Resolution = { id: string | null; exact: boolean };

/**
 * Resolve teacher text from a document to a directory teacher.
 * Only exact/alias/code matches (or a single near-identical spelling) resolve; anything
 * else stays unresolved so the admin decides. Never invents a teacher.
 */
export function resolveTeacher(
  raw: string,
  index: TeacherIndex,
  teacherMap: Record<string, string> = {},
  opts: { fuzzy?: boolean } = {},
  depth = 0,
): Resolution {
  const text = raw.trim();
  if (!text) return { id: null, exact: true };

  const mapped = teacherMap[text];
  // "same person as <another name in this document>"
  if (mapped?.startsWith("SAME:") && depth < 5) return resolveTeacher(mapped.slice(5), index, teacherMap, opts, depth + 1);
  if (mapped && mapped !== "NEW" && index.ids.has(mapped)) return { id: mapped, exact: true };

  const key = normalizeKey(text);
  if (!key) return { id: null, exact: true };

  const one = (ids: string[] | undefined) => (ids && ids.length === 1 ? ids[0] : null);

  // "15 Mr. X TGT-Maths" / "Mr. X, TGT-Maths": match the person by name, then by the printed code
  const parsed = parseTeacherText(text);
  if (parsed.kind === "person") {
    const byPerson = one(index.byName.get(normalizeKey(parsed.name)));
    if (byPerson) return { id: byPerson, exact: true };
    const byPrintedCode = parsed.code ? one(index.byCode.get(normalizeKey(parsed.code))) : null;
    if (byPrintedCode) return { id: byPrintedCode, exact: true };
  }

  const byName = one(index.byName.get(key));
  if (byName) return { id: byName, exact: true };
  const byCode = one(index.byCode.get(key));
  if (byCode) return { id: byCode, exact: true };

  // "Mr. XYZ (TGT-SCI)" or "XYZ / TGT-SCI" - try each part
  const parts = text
    .split(/[()\/,;]| - | – /)
    .map((p) => normalizeKey(p))
    .filter((p) => p.length >= 2);
  if (parts.length > 1) {
    const hits = new Set<string>();
    for (const p of parts) {
      const id = one(index.byName.get(p)) ?? one(index.byCode.get(p));
      if (id) hits.add(id);
    }
    if (hits.size === 1) return { id: [...hits][0], exact: true };
  }

  // optional one-typo tolerance. Off by default: near-identical codes (PGT-ENG / TGT-ENG) are
  // different teachers, so near matches are only ever offered as suggestions.
  if (opts.fuzzy && key.length >= 6) {
    const max = key.length >= 12 ? 2 : 1;
    const found = new Set<string>();
    for (const k of index.keys) {
      if (k.key.length < 6) continue;
      if (levenshtein(key, k.key, max) <= max) found.add(k.id);
    }
    if (found.size === 1) return { id: [...found][0], exact: false };
  }
  return { id: null, exact: true };
}
