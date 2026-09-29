import { config } from "../config";
import { isClock, toMinutes } from "../time";
import type { DraftData, Issue, ValidationResult } from "./schema";
import { normalizeClassName } from "./normalize";
import { buildTeacherIndex, levenshtein, resolveTeacher, type TeacherLite } from "./teacherMatch";
import { codesEquivalent, parseTeacherText } from "../teacherIdentity";
import { rosterChecks, type RoutineBusy } from "./rosterChecks";

function collectTeacherNames(d: DraftData): string[] {
  const set = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) set.add(t);
  };
  d.periods.forEach((p) => !p.isBreak && add(p.teacherName));
  d.modDuties.forEach((m) => add(m.teacherName));
  d.weeklyOffs.forEach((w) => add(w.teacherName));
  d.remedial.forEach((r) => add(r.teacherName));
  return [...set];
}

export type SchoolLists = { classes: string[]; sections: string[] };

/** Only used as a fallback when a caller (tests) does not pass real SchoolSettings. */
export const DEFAULT_SCHOOL_LISTS: SchoolLists = {
  classes: ["VI", "VII", "VIII", "IX", "X", "XI", "XII"],
  sections: ["A", "B", "C", "D", "E", "F"],
};

/**
 * Deterministic checks run after AI/OCR extraction and again after every manual edit.
 * Errors block publishing; warnings are shown for review.
 */
export function validateDraft(data: DraftData, teachers: TeacherLite[], routine?: RoutineBusy[], school: SchoolLists = DEFAULT_SCHOOL_LISTS): ValidationResult {
  const issues: Issue[] = [];
  const index = buildTeacherIndex(teachers.filter((t) => t.active));
  const err = (scope: Issue["scope"], itemId: string | undefined, code: string, message: string) =>
    issues.push({ severity: "error", scope, itemId, code, message });
  const warn = (scope: Issue["scope"], itemId: string | undefined, code: string, message: string) =>
    issues.push({ severity: "warning", scope, itemId, code, message });

  // ---- teacher resolution
  const resolved: Record<string, string | null> = {};
  const approximate = new Set<string>();
  for (const name of collectTeacherNames(data)) {
    const r = resolveTeacher(name, index, data.teacherMap);
    resolved[name] = r.id;
    if (r.id && !r.exact) approximate.add(name);
  }
  // a name is "new" if the admin chose to create it, or pointed it at another name that will be created
  const isNew = (name: string, depth = 0): boolean => {
    const m = data.teacherMap[name.trim()];
    if (m === "NEW") return true;
    return !!m && m.startsWith("SAME:") && depth < 5 ? isNew(m.slice(5), depth + 1) : false;
  };
  const unresolvedTeachers = Object.entries(resolved)
    .filter(([name, id]) => !id && !isNew(name))
    .map(([name]) => name);
  // probable OCR misreadings, offered as one-click suggestions (never applied automatically):
  // an unmatched name that differs only by look-alike characters (5/S, 1/l/I, 0/O) from a common
  // name in this document or from a teacher in the list. Different letters (PGT-ENG vs TGT-ENG) never match.
  const uses = new Map<string, number>();
  for (const p of data.periods) if (!p.isBreak && p.teacherName.trim()) uses.set(p.teacherName.trim(), (uses.get(p.teacherName.trim()) ?? 0) + 1);
  const fold = (t: string) => t.toLowerCase().replace(/¢/g, "c").replace(/[^a-z0-9]/g, "").replace(/5/g, "s").replace(/[l1|]/g, "i").replace(/0/g, "o");
  const codeLike = (t: string) => /^(tgt|pgt|prt|pet|ppl|pat|hm|vp|lib|ct)/i.test(t.trim());
  const suggestions: Record<string, string> = {};
  const known = teachers.filter((t) => t.active).flatMap((t) => [t.name, ...(t.code ? [t.code] : []), ...t.aliases].map((label) => ({ label: t.name, key: fold(label) })));
  for (const [name, n] of uses) {
    if (resolved[name] || data.teacherMap[name]) continue;
    const a = fold(name);
    if (a.length < 4) continue;
    let best: { label: string; d: number; n: number } | null = null;
    const consider = (label: string, key: string, count: number) => {
      const limit = codeLike(name) || codeLike(label) ? 0 : 1;
      const d = a === key ? 0 : levenshtein(a, key, limit);
      if (d <= limit && (!best || d < best.d || (d === best.d && count > best.n))) best = { label, d, n: count };
    };
    for (const [q, qn] of uses) if (q !== name && qn >= Math.max(4, n * 3) && fold(q).length >= 4) consider(q, fold(q), qn);
    for (const k of known) if (k.key.length >= 4) consider(k.label, k.key, 0);
    if (best) suggestions[name] = (best as { label: string }).label;
  }
  // a teacher code that is an abbreviation of one person's printed code (TGT-MATH ~ TGT-Maths of "Mr. X")
  for (const name of Object.keys(resolved)) {
    if (resolved[name] || suggestions[name] || data.teacherMap[name]) continue;
    const p = parseTeacherText(name);
    if (p.kind !== "code") continue;
    const owners = teachers.filter((t) => t.active && [t.code, ...t.aliases].some((c) => c && codesEquivalent(c, p.code)));
    if (owners.length === 1) suggestions[name] = owners[0].name;
  }
  for (const name of unresolvedTeachers) {
    if (parseTeacherText(name).kind === "garbage") {
      err("general", undefined, "teacherNotName", `"${name}" looks like heading text, not a teacher - remove it or correct the cell.`);
    }
  }
  const teacherOf = (name: string): string | null => {
    const t = name.trim();
    return t ? (resolved[t] ?? null) : null;
  };

  // ---- routine periods
  const seenKey = new Map<string, string>();
  const perClassDay = new Map<string, typeof data.periods>();
  for (const p of data.periods) {
    const where = `${p.className}${p.section ? "-" + p.section : ""} ${p.day.toLowerCase()}`;
    const cn = normalizeClassName(p.className);
    if (!cn || !school.classes.includes(cn)) {
      err("period", p.id, "class", `"${p.className}" is not a valid class (${where}).`);
    }
    if (p.section && !school.sections.includes(p.section.toUpperCase())) {
      err("period", p.id, "section", `Section "${p.section}" is not valid (${where}).`);
    }
    if (!p.isBreak) {
      if (p.periodNumber == null || p.periodNumber < 1 || p.periodNumber > config.maxPeriodNumber) {
        err("period", p.id, "periodNumber", `Impossible period number (${where}).`);
      }
      if (!p.subject.trim()) {
        warn("period", p.id, "subject", `Subject missing (${where}, period ${p.periodNumber ?? "?"}).`);
      }
      const tName = p.teacherName.trim();
      if (!tName) {
        warn("period", p.id, "teacher", `Teacher missing (${where}, period ${p.periodNumber ?? "?"}).`);
      } else if (!teacherOf(tName) && !isNew(tName)) {
        err("period", p.id, "teacherUnknown", `Teacher "${tName}" is not in the teacher list (${where}).`);
      } else if (/[-\/]\s*$/.test(tName)) {
        warn("period", p.id, "teacherIncomplete", `Teacher code "${tName}" looks cut off (${where}).`);
      } else if (approximate.has(tName)) {
        warn("period", p.id, "teacherApprox", `Teacher "${tName}" was matched approximately - please confirm.`);
      }
    }

    if (p.startTime && !isClock(p.startTime)) err("period", p.id, "time", `Invalid start time (${where}).`);
    if (p.endTime && !isClock(p.endTime)) err("period", p.id, "time", `Invalid end time (${where}).`);
    const s = toMinutes(p.startTime);
    const e = toMinutes(p.endTime);
    if (s != null && e != null) {
      if (e <= s) err("period", p.id, "timeOrder", `End time is not after start time (${where}).`);
      else if (s < 5 * 60 || e > 21 * 60) warn("period", p.id, "timeRange", `Unusual school time (${where}).`);
    } else if (!p.isBreak) {
      warn("period", p.id, "timeMissing", `Time missing (${where}, period ${p.periodNumber ?? "?"}).`);
    }

    if (p.confidence != null && p.confidence < config.lowConfidence) {
      warn("period", p.id, "lowConfidence", `Low confidence (${Math.round(p.confidence * 100)}%) - ${where}.`);
    }

    const key = `${cn ?? p.className}|${p.section}|${p.day}|${p.slot}`;
    const dup = seenKey.get(key);
    if (dup) err("period", p.id, "duplicate", `Duplicate entry for ${where}, column ${p.slot + 1}.`);
    else seenKey.set(key, p.id);

    const cd = `${cn ?? p.className}|${p.section}|${p.day}`;
    if (!perClassDay.has(cd)) perClassDay.set(cd, []);
    perClassDay.get(cd)!.push(p);
  }

  // overlapping periods for one class on one day
  for (const list of perClassDay.values()) {
    const timed = list
      .filter((p) => toMinutes(p.startTime) != null && toMinutes(p.endTime) != null)
      .sort((a, b) => toMinutes(a.startTime)! - toMinutes(b.startTime)!);
    for (let i = 1; i < timed.length; i++) {
      const p = timed[i];
      const gap = toMinutes(p.startTime)! - toMinutes(timed[i - 1].endTime)!;
      const where = `${p.className}${p.section ? "-" + p.section : ""} ${p.day.toLowerCase()}`;
      if (gap < 0) warn("period", p.id, "overlap", `Time overlaps the previous period (${where}).`);
      else if (gap > 0 && gap <= 5)
        warn("period", p.id, "timeGap", `Starts ${gap} min after the previous period ends (${where}) - a digit may have been misread.`);
    }
  }

  // one teacher in two classes at the same time
  const byTeacherDay = new Map<string, typeof data.periods>();
  for (const p of data.periods) {
    if (p.isBreak) continue;
    const tid = teacherOf(p.teacherName);
    if (!tid) continue;
    const k = `${tid}|${p.day}`;
    if (!byTeacherDay.has(k)) byTeacherDay.set(k, []);
    byTeacherDay.get(k)!.push(p);
  }
  for (const list of byTeacherDay.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.className === b.className && a.section === b.section) continue;
        const as = toMinutes(a.startTime), ae = toMinutes(a.endTime);
        const bs = toMinutes(b.startTime), be = toMinutes(b.endTime);
        const clash =
          as != null && ae != null && bs != null && be != null
            ? as < be && bs < ae
            : a.periodNumber != null && a.periodNumber === b.periodNumber;
        if (clash) {
          warn(
            "period",
            b.id,
            "teacherClash",
            `${b.teacherName} is scheduled in ${a.className}${a.section ? "-" + a.section : ""} and ${b.className}${b.section ? "-" + b.section : ""} at the same time on ${b.day.toLowerCase()}.`,
          );
        }
      }
    }
  }

  // ---- MOD
  const seenMod = new Set<string>();
  for (const m of data.modDuties) {
    if (!m.teacherName.trim()) err("mod", m.id, "teacher", "MOD entry without a teacher.");
    else if (!teacherOf(m.teacherName) && !isNew(m.teacherName.trim()))
      err("mod", m.id, "teacherUnknown", `MOD teacher "${m.teacherName}" is not in the teacher list.`);
    const k = `${m.dutyType}|${m.date}|${m.teacherName.trim().toLowerCase()}`;
    if (seenMod.has(k)) err("mod", m.id, "duplicate", `Duplicate MOD entry for ${m.teacherName} on ${m.date}.`);
    seenMod.add(k);
    if (m.confidence != null && m.confidence < config.lowConfidence)
      warn("mod", m.id, "lowConfidence", `Low confidence MOD entry (${m.teacherName}, ${m.date}).`);
  }

  // ---- weekly off
  const seenOff = new Set<string>();
  for (const w of data.weeklyOffs) {
    if (!w.teacherName.trim()) err("weeklyOff", w.id, "teacher", "Weekly off entry without a teacher.");
    else if (!teacherOf(w.teacherName) && !isNew(w.teacherName.trim()))
      err("weeklyOff", w.id, "teacherUnknown", `Weekly-off teacher "${w.teacherName}" is not in the teacher list.`);
    const k = `${w.day}|${w.teacherName.trim().toLowerCase()}`;
    if (seenOff.has(k)) err("weeklyOff", w.id, "duplicate", `Duplicate weekly off for ${w.teacherName}.`);
    seenOff.add(k);
    if (w.confidence != null && w.confidence < config.lowConfidence)
      warn("weeklyOff", w.id, "lowConfidence", `Low confidence weekly off (${w.teacherName}).`);
  }

  // ---- remedial
  for (const r of data.remedial) {
    const cn = normalizeClassName(r.className);
    if (!cn || !school.classes.includes(cn)) err("remedial", r.id, "class", `"${r.className}" is not a valid class.`);
    if (!r.activity.trim()) warn("remedial", r.id, "activity", "Activity missing.");
    if (r.startTime && !isClock(r.startTime)) err("remedial", r.id, "time", "Invalid start time.");
    if (r.endTime && !isClock(r.endTime)) err("remedial", r.id, "time", "Invalid end time.");
    const s = toMinutes(r.startTime), e = toMinutes(r.endTime);
    if (s != null && e != null && e <= s) err("remedial", r.id, "timeOrder", "End time is not after start time.");
    const t = r.teacherName.trim();
    if (t && !teacherOf(t) && !isNew(t))
      err("remedial", r.id, "teacherUnknown", `Teacher "${t}" is not in the teacher list.`);
    if (r.confidence != null && r.confidence < config.lowConfidence)
      warn("remedial", r.id, "lowConfidence", `Low confidence entry (${r.activity || r.className}).`);
  }

  // ---- clubs
  const seenClub = new Set<string>();
  for (const c of data.clubs) {
    const k = c.name.trim().toLowerCase();
    if (seenClub.has(k)) err("club", c.id, "duplicate", `Club "${c.name}" appears twice.`);
    seenClub.add(k);
    if (c.confidence != null && c.confidence < config.lowConfidence)
      warn("club", c.id, "lowConfidence", `Low confidence club entry (${c.name}).`);
  }

  // ---- overall
  const total =
    data.periods.length + data.modDuties.length + data.weeklyOffs.length + data.remedial.length + data.clubs.length;
  if (total === 0) err("general", undefined, "empty", "Nothing was extracted. Add entries by hand or upload a clearer document.");
  if (data.kind === "ROUTINE" && data.periods.length === 0 && total > 0)
    warn("general", undefined, "noPeriods", "No class timetable found in this document.");

  for (const name of unresolvedTeachers) {
    // one general hint per unknown teacher (per-item errors are listed above)
    warn("general", undefined, "teacherHint", `"${name}" needs to be matched to a teacher or created.`);
  }

  rosterChecks(data, resolved, routine, warn);

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return { issues, errors, warnings, canPublish: errors === 0, resolved, unresolvedTeachers, suggestions };
}
