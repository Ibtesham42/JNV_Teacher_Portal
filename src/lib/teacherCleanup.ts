import { db } from "./db";
import { codesEquivalent, parseTeacherText, personKey, type ParsedTeacher } from "./teacherIdentity";

type Row = {
  id: string;
  name: string;
  code: string | null;
  designation: string | null;
  aliases: string[];
  active: boolean;
  refs: number;
  /** routine periods / remedial rows - real timetable data that must not be silently dropped */
  hardRefs: number;
  hasUser: boolean;
};

export type MergeStep = {
  keepId: string;
  keepName: string;
  finalName: string;
  finalCode: string | null;
  finalDesignation: string | null;
  finalAliases: string[];
  mergeIds: string[];
  mergedNames: string[];
};
export type CleanupPlan = {
  merges: MergeStep[];
  deletes: { id: string; name: string; refs: number; reason: string }[];
  keeps: { id: string; name: string; reason: string }[];
  totalBefore: number;
  totalAfter: number;
};

const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => !!x && x.trim() !== "").map((x) => x.trim()))];

/**
 * Works out how to turn the polluted teacher list into a clean one - without touching the database.
 *  1. text that is neither a person nor a code (headings, sentences) -> deleted (or kept when still in use)
 *  2. the same person written many ways ("15 Mr. X TGT-Maths", "Mr. X") -> one record
 *  3. code-only records (TGT-MATH, TGT-MATHS ...) -> merged into the one person who holds that post
 *     (only when exactly one person matches; ambiguous codes stay as they are)
 *  4. code-only variants of the same post with no person -> one record
 * Every merged spelling is kept as an alias, so future uploads match it exactly.
 */
export function planCleanup(rows: Row[]): CleanupPlan {
  const parsed = new Map<string, ParsedTeacher>();
  for (const r of rows) parsed.set(r.id, parseTeacherText(r.name));

  const deletes: CleanupPlan["deletes"] = [];
  const keeps: CleanupPlan["keeps"] = [];
  const persons = new Map<string, Row[]>(); // personKey -> records
  const codeRows: Row[] = [];

  for (const r of rows) {
    const p = parsed.get(r.id)!;
    if (p.kind === "garbage") {
      // a record that already looks fine (e.g. entered by hand with a code) is not garbage
      if (r.code || r.hasUser) keeps.push({ id: r.id, name: r.name, reason: "has a code or login" });
      else if (r.hardRefs > 0) keeps.push({ id: r.id, name: r.name, reason: `still used by ${r.hardRefs} timetable row(s) - please correct it` });
      else deletes.push({ id: r.id, name: r.name, refs: r.refs, reason: "not a person or a teacher code" });
      continue;
    }
    if (p.kind === "person") {
      const k = personKey(p.name);
      persons.set(k, [...(persons.get(k) ?? []), r]);
    } else if (/\//.test(r.name) || /\d\s*,\s*\d/.test(r.name)) {
      // "TGT-SCIENCE-2,4 / PGT-PHY.-1,3,5": two teachers sharing a slot - never folded into one person
      keeps.push({ id: r.id, name: r.name, reason: "two teachers share this slot" });
    } else codeRows.push(r);
  }

  const merges: MergeStep[] = [];
  const personRecords: { key: string; step: MergeStep; codes: string[] }[] = [];

  for (const [key, list] of persons) {
    // keep the record with a login, then the most used, then the cleanest name
    const sorted = [...list].sort((a, b) => Number(b.hasUser) - Number(a.hasUser) || b.refs - a.refs || a.name.length - b.name.length);
    const keep = sorted[0];
    const infos = list.map((r) => parseTeacherText(r.name)).filter((x): x is Extract<ParsedTeacher, { kind: "person" }> => x.kind === "person");
    // canonical display name: the shortest clean spelling (no serial, no code)
    const finalName = infos.map((i) => i.name).sort((a, b) => a.length - b.length)[0] ?? keep.name;
    const codes = uniq([keep.code, ...list.map((r) => r.code), ...infos.map((i) => i.code)]);
    const designation = uniq([keep.designation, ...list.map((r) => r.designation), ...infos.map((i) => i.designation)])[0] ?? null;
    const step: MergeStep = {
      keepId: keep.id,
      keepName: keep.name,
      finalName,
      finalCode: codes[0] ?? null,
      finalDesignation: designation,
      finalAliases: uniq([...list.flatMap((r) => r.aliases), ...codes.slice(1)]),
      mergeIds: sorted.slice(1).map((r) => r.id),
      mergedNames: sorted.slice(1).map((r) => r.name),
    };
    personRecords.push({ key, step, codes });
  }

  // code-only records -> person holding an equivalent code (unique), else group by equivalent code
  const leftoverCodes: Row[] = [];
  for (const cr of codeRows) {
    const p = parsed.get(cr.id)! as Extract<ParsedTeacher, { kind: "code" }>;
    const holders = personRecords.filter((pr) => pr.codes.some((c) => codesEquivalent(c, p.code)));
    if (holders.length === 1) {
      const h = holders[0].step;
      h.mergeIds.push(cr.id);
      h.mergedNames.push(cr.name);
      h.finalAliases = uniq([...h.finalAliases, cr.name, p.code]);
    } else {
      leftoverCodes.push(cr);
      if (holders.length > 1) keeps.push({ id: cr.id, name: cr.name, reason: `code matches ${holders.length} people - left for you to decide` });
    }
  }
  const codeGroups: Row[][] = [];
  for (const cr of leftoverCodes) {
    const p = parsed.get(cr.id)! as Extract<ParsedTeacher, { kind: "code" }>;
    const g = codeGroups.find((grp) => codesEquivalent((parsed.get(grp[0].id) as { code: string }).code, p.code));
    if (g) g.push(cr);
    else codeGroups.push([cr]);
  }
  for (const grp of codeGroups) {
    const sorted = [...grp].sort((a, b) => Number(b.hasUser) - Number(a.hasUser) || b.refs - a.refs || a.name.length - b.name.length);
    const keep = sorted[0];
    if (sorted.length > 1) {
      merges.push({
        keepId: keep.id,
        keepName: keep.name,
        finalName: keep.name,
        finalCode: keep.code ?? (parsed.get(keep.id) as { code: string }).code,
        finalDesignation: keep.designation,
        finalAliases: uniq([...grp.flatMap((r) => r.aliases), ...sorted.slice(1).map((r) => r.name)]),
        mergeIds: sorted.slice(1).map((r) => r.id),
        mergedNames: sorted.slice(1).map((r) => r.name),
      });
    } else if (!keep.code) {
      // a lone code record: remember its code so it can be matched later
      merges.push({
        keepId: keep.id, keepName: keep.name, finalName: keep.name, finalCode: (parsed.get(keep.id) as { code: string }).code,
        finalDesignation: keep.designation, finalAliases: keep.aliases, mergeIds: [], mergedNames: [],
      });
    }
  }

  for (const pr of personRecords) {
    const s = pr.step;
    const changed = s.mergeIds.length > 0 || s.finalName !== s.keepName || s.finalCode !== (rows.find((r) => r.id === s.keepId)?.code ?? null);
    if (changed) merges.push(s);
  }

  const removed = new Set([...deletes.map((d) => d.id), ...merges.flatMap((m) => m.mergeIds)]);
  return { merges, deletes, keeps, totalBefore: rows.length, totalAfter: rows.length - removed.size };
}

export async function loadRows(): Promise<Row[]> {
  const ts = await db.teacher.findMany({
    include: { user: { select: { id: true } }, _count: { select: { periods: true, modDuties: true, weeklyOffs: true, remedials: true } } },
  });
  return ts.map((t) => ({
    id: t.id, name: t.name, code: t.code, designation: t.designation, aliases: t.aliases, active: t.active,
    refs: t._count.periods + t._count.modDuties + t._count.weeklyOffs + t._count.remedials,
    hardRefs: t._count.periods + t._count.remedials,
    hasUser: !!t.user,
  }));
}

export async function previewCleanup(): Promise<CleanupPlan> {
  return planCleanup(await loadRows());
}

/** Applies the plan in one transaction: re-points every reference to the kept teacher, then removes the rest. */
export async function applyCleanup(plan: CleanupPlan): Promise<{ merged: number; deleted: number }> {
  return db.$transaction(
    async (tx) => {
      let merged = 0;
      for (const m of plan.merges) {
        for (const id of m.mergeIds) {
          await tx.routinePeriod.updateMany({ where: { teacherId: id }, data: { teacherId: m.keepId } });
          await tx.remedialSchedule.updateMany({ where: { teacherId: id }, data: { teacherId: m.keepId } });
          // unique (date, teacherId, dutyType) / (teacherId, day): move rows that do not collide, drop the rest
          for (const d of await tx.modDuty.findMany({ where: { teacherId: id } })) {
            const clash = await tx.modDuty.findFirst({ where: { teacherId: m.keepId, date: d.date, dutyType: d.dutyType } });
            if (clash) await tx.modDuty.delete({ where: { id: d.id } });
            else await tx.modDuty.update({ where: { id: d.id }, data: { teacherId: m.keepId, teacherName: m.finalName } });
          }
          for (const w of await tx.weeklyOff.findMany({ where: { teacherId: id } })) {
            const clash = await tx.weeklyOff.findFirst({ where: { teacherId: m.keepId, day: w.day } });
            if (clash) await tx.weeklyOff.delete({ where: { id: w.id } });
            else await tx.weeklyOff.update({ where: { id: w.id }, data: { teacherId: m.keepId } });
          }
          await tx.user.updateMany({ where: { teacherId: id, NOT: { teacherId: m.keepId } }, data: { teacherId: null } });
          await tx.teacher.delete({ where: { id } });
          merged++;
        }
        await tx.teacher.update({
          where: { id: m.keepId },
          data: { name: m.finalName, code: m.finalCode, designation: m.finalDesignation, aliases: m.finalAliases.filter((a) => a !== m.finalName) },
        });
        // keep the denormalised names on old rows in step with the teacher
        await tx.modDuty.updateMany({ where: { teacherId: m.keepId }, data: { teacherName: m.finalName } });
        await tx.routinePeriod.updateMany({ where: { teacherId: m.keepId }, data: { teacherName: m.finalName } });
        await tx.remedialSchedule.updateMany({ where: { teacherId: m.keepId }, data: { teacherName: m.finalName } });
      }
      let deleted = 0;
      for (const d of plan.deletes) {
        await tx.teacher.delete({ where: { id: d.id } }).then(() => deleted++).catch(() => {});
      }
      return { merged, deleted };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
