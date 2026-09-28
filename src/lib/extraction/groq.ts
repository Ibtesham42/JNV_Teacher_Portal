import { config } from "../config";
import { buildLines, median } from "./layout";
import { draftDataSchema, type DraftData } from "./schema";
import { levenshtein } from "./teacherMatch";
import { toDraft } from "./ai";
import type { PageContent } from "./types";
import type { DocKind } from "./heuristic";

const URL = "https://api.groq.com/openai/v1/chat/completions";

export const groqEnabled = () => !!config.groq.apiKey;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Models tried in order; Groq retires models from time to time, so a missing model falls through to the next. */
const FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
let workingModel: string | null = null;

export async function chatJson(system: string, user: string, maxTokens = 4000): Promise<any> {
  const candidates = [...new Set([workingModel, config.groq.model, ...FALLBACK_MODELS].filter(Boolean) as string[])];
  let lastError = "";
  for (const model of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const isGptOss = model.startsWith("openai/gpt-oss");
      const res = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.groq.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens + (isGptOss ? 3000 : 0), // reasoning models spend tokens thinking
          response_format: { type: "json_object" },
          ...(isGptOss ? { reasoning_effort: "low" } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 429 && attempt < 2) {
        const wait = Number(res.headers.get("retry-after")) || 8 * (attempt + 1);
        await sleep(Math.min(wait, 30) * 1000);
        continue;
      }
      if (res.status === 404 || res.status === 400) {
        lastError = `Groq ${res.status} (${model}): ${(await res.text()).slice(0, 160)}`;
        break; // model missing / unsupported -> next candidate
      }
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = await res.json();
      const text: string = body.choices?.[0]?.message?.content ?? "{}";
      workingModel = model;
      try {
        return JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) return JSON.parse(m[0]);
        throw new Error("Groq returned text that is not JSON.");
      }
    }
  }
  throw new Error(lastError || "Groq rate limit - try again in a minute.");
}

// ---------------------------------------------------------------- OCR clean-up

const fold = (t: string) => t.toLowerCase().replace(/¢/g, "c").replace(/[^a-z0-9]/g, "").replace(/5/g, "s").replace(/[l1|]/g, "i").replace(/0/g, "o");

function countBy(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) {
    const t = v.trim();
    if (t) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

/** Rewrite every subject / teacher string of a draft through per-kind maps. */
function applyMaps(draft: DraftData, sub: Map<string, string>, tea: Map<string, string>, cap: number): number {
  let changes = 0;
  const cp = (c: number | null) => (c == null ? null : Math.min(c, cap));
  for (const p of draft.periods) {
    if (p.isBreak) continue;
    const s = sub.get(p.subject.trim());
    const t = tea.get(p.teacherName.trim());
    if (s) { p.subject = s; p.confidence = cp(p.confidence); changes++; }
    if (t) { p.teacherName = t; p.confidence = cp(p.confidence); changes++; }
  }
  for (const r of draft.remedial) {
    const s = sub.get(r.activity.trim());
    const t = tea.get(r.teacherName.trim());
    if (s) { r.activity = s; r.confidence = cp(r.confidence); changes++; }
    if (t) { r.teacherName = t; r.confidence = cp(r.confidence); changes++; }
  }
  for (const m of draft.modDuties) { const t = tea.get(m.teacherName.trim()); if (t) { m.teacherName = t; changes++; } }
  for (const w of draft.weeklyOffs) { const t = tea.get(w.teacherName.trim()); if (t) { w.teacherName = t; changes++; } }
  return changes;
}

function poolsOf(draft: DraftData) {
  const subjects = countBy([...draft.periods.filter((p) => !p.isBreak).map((p) => p.subject), ...draft.remedial.map((r) => r.activity)]);
  const teachers = countBy([
    ...draft.periods.filter((p) => !p.isBreak).map((p) => p.teacherName),
    ...draft.remedial.map((r) => r.teacherName),
    ...draft.modDuties.map((m) => m.teacherName),
    ...draft.weeklyOffs.map((w) => w.teacherName),
  ]);
  return { subjects, teachers };
}

/**
 * No AI needed: spellings that differ only by look-alike characters (5/S, 1/l/I, 0/O), case or
 * punctuation ("S.Sc", "SSc.", "S$.Sc", "TGT-5.5C" ...) are one thing. Merge them into the most
 * frequent spelling. Different letters (PGT vs TGT, MATH vs MATHS) are never merged.
 */
export function mergeOcrVariants(draft: DraftData): { draft: DraftData; changes: number } {
  const { subjects, teachers } = poolsOf(draft);
  const build = (pool: Map<string, number>) => {
    const groups = new Map<string, [string, number][]>();
    for (const [k, n] of pool) {
      const f = fold(k);
      if (f.length < 3) continue;
      groups.set(f, [...(groups.get(f) ?? []), [k, n]]);
    }
    const map = new Map<string, string>();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
      for (const [k] of list.slice(1)) map.set(k, list[0][0]);
    }
    return map;
  };
  const next = draftDataSchema.parse(JSON.parse(JSON.stringify(draft)));
  const changes = applyMaps(next, build(subjects), build(teachers), 0.85);
  if (changes) next.notes.push(`${changes} value(s) that differed only by look-alike characters or punctuation (e.g. "S.Sc" / "S$.Sc", "TGT-5.5C" / "TGT-S.SC") were merged into the most common spelling. Their confidence is capped at 85%.`);
  return { draft: next, changes };
}

const NORMALISE_SYSTEM = `You clean OCR mistakes in data read from a school timetable.
You get two lists of strings (with how many times each occurs): "subjects" and "teachers" (teacher codes such as TGT-SCI, PGT-Phy).
For a string that is clearly an OCR misreading (digits or symbols in place of letters, l/1/I confusion, stray punctuation, letters dropped or added) of ANOTHER string in the same list, map it to that other string.
Rules:
- The target MUST be copied exactly from the same list. Never invent a new string.
- Do NOT merge strings that are valid on their own even if similar (PGT-ENG and TGT-ENG are different teachers; MATH and MATHS may be different; different subjects stay different).
- Prefer the string that occurs more often.
- Only include strings that must change. If unsure, leave it out.
Answer with JSON only: {"subjects": {"<misread>": "<correct>"}, "teachers": {"<misread>": "<correct>"}}`;

/**
 * Text model pass: repairs OCR garbling by mapping misread strings onto spellings that already
 * occur in the same document. It can only choose among existing strings, so it cannot invent data.
 */
export async function groqNormalize(draft: DraftData): Promise<{ draft: DraftData; changes: number }> {
  const { subjects, teachers } = poolsOf(draft);
  if (subjects.size + teachers.size < 3) return { draft, changes: 0 };

  const fmt = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 150).map(([k, n]) => `${JSON.stringify(k)}: ${n}`);
  const out = await chatJson(NORMALISE_SYSTEM, JSON.stringify({ subjects: fmt(subjects), teachers: fmt(teachers) }), 3000);

  const accept = (pool: Map<string, number>, raw: unknown): Map<string, string> => {
    const ok = new Map<string, string>();
    if (!raw || typeof raw !== "object") return ok;
    for (const [from, to] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof to !== "string" || from === to || !pool.has(from) || !pool.has(to)) continue;
      // safety net: a genuine misreading is at most one character away (two for long strings)
      const a = fold(from);
      const b = fold(to);
      const limit = Math.min(a.length, b.length) >= 9 ? 2 : 1;
      if (levenshtein(a, b, limit) > limit) continue;
      // never merge codes that differ in their leading letters (PGT vs TGT)
      if (/^(tgt|pgt|prt|pet)/i.test(from.trim()) && from.trim().slice(0, 3).toLowerCase() !== to.trim().slice(0, 3).toLowerCase()) continue;
      ok.set(from, to);
    }
    return ok;
  };
  const next = draftDataSchema.parse(JSON.parse(JSON.stringify(draft)));
  const changes = applyMaps(next, accept(subjects, out.subjects), accept(teachers, out.teachers), 0.8);
  if (changes) next.notes.push(`AI (${workingModel ?? config.groq.model}) corrected ${changes} OCR misreading(s) using spellings found elsewhere in the document. Corrected cells are capped at 80% confidence - please check them.`);
  return { draft: next, changes };
}

// ---------------------------------------------------------------- fallback: structure OCR text

export const EXTRACT_SYSTEM = `You convert OCR text of a school document (Jawahar Navodaya Vidyalaya) into JSON.
The text keeps the page layout: cells on one line are separated by " | ". OCR errors are possible.
Return ONLY JSON with this shape (omit nothing, use [] when a list is empty):
{"session": string|null, "title": string|null,
 "periods": [{"className":"VI","section":"A","day":"MONDAY","slot":0,"periodNumber":1,"isBreak":false,"label":null,"startTime":"08:15","endTime":"08:55","subject":"Science","teacherName":"TGT-SCI","confidence":0.8}],
 "modDuties": [{"date":"YYYY-MM-DD","teacherName":"","description":"","confidence":0.8}],
 "weeklyOffs": [{"day":"SUNDAY","teacherName":"","confidence":0.8}],
 "remedial": [{"category":"REMEDIAL|LIFE_SKILL|ENRICHMENT|OTHER","className":"VI","section":"","day":"MONDAY","startTime":"15:00","endTime":"15:45","activity":"","teacherName":"","confidence":0.8}],
 "clubs": [{"name":"","teachers":[],"activities":[],"confidence":0.8}],
 "warnings": []}
Rules: copy only what is printed - never invent teachers, subjects, times, dates, MOD duties or weekly offs. Copy teacher names/codes exactly as printed. Class is a roman numeral (VI, VII, VIII, IX, X). Days are upper-case English. Times are 24-hour HH:MM (school hours 07:00-17:00, so 1:30 means 13:30). slot is the 0-based column position within a day, breaks included (isBreak=true, periodNumber=null). MOD needs a printed calendar date. Give lower confidence when the text is garbled.`;

export function layoutText(page: PageContent): string {
  const lines = buildLines(page.words);
  const lh = median(page.words.map((w) => w.y1 - w.y0)) || 10;
  return lines
    .map((l) => {
      let s = "";
      l.words.forEach((w, i) => {
        if (i) s += w.x0 - l.words[i - 1].x1 > lh * 1.6 ? " | " : " ";
        s += w.text;
      });
      return s;
    })
    .join("\n");
}

/** Used only when the rule-based reader recognised nothing (unfamiliar layout). */
export async function groqExtractFromText(pages: PageContent[], kind: DocKind): Promise<DraftData> {
  const merged = draftDataSchema.parse({ kind });
  for (const page of pages) {
    const text = layoutText(page).slice(0, 14000);
    if (text.trim().length < 30) continue;
    const raw = await chatJson(EXTRACT_SYSTEM, `Document type: ${kind}. Page ${page.pageNumber} of ${pages.length}.\n\n${text}`, 7000);
    const d = toDraft(kind, raw);
    merged.periods.push(...d.periods);
    merged.modDuties.push(...d.modDuties);
    merged.weeklyOffs.push(...d.weeklyOffs);
    merged.remedial.push(...d.remedial);
    merged.clubs.push(...d.clubs);
    merged.notes.push(...d.notes.map((n) => n.replace(/^AI:/, `AI (${workingModel ?? config.groq.model}):`)));
    merged.session ||= d.session;
    merged.title ||= d.title;
  }
  return merged;
}
