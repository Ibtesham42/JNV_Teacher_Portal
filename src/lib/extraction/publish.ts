import { Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../security/api";
import { dateFromISO, todayISO, weekdayOfISO } from "../time";
import { normalizeClassName, normalizeKey } from "./normalize";
import { draftDataSchema, type DraftData, type ValidationResult } from "./schema";
import { buildTeacherIndex, resolveTeacher, type TeacherLite } from "./teacherMatch";
import { validateDraft } from "./validate";
import { parseTeacherText } from "../teacherIdentity";

const CODE_START = /^(TGT|PGT|PRT|PET|PPL|PAT|HM|VP)\b/i;

export async function loadTeachers(): Promise<TeacherLite[]> {
  return db.teacher.findMany({ select: { id: true, name: true, code: true, aliases: true, active: true } });
}

export async function validateStoredDraft(documentId: string): Promise<{ data: DraftData; validation: ValidationResult }> {
  const draft = await db.extractionDraft.findUnique({ where: { documentId } });
  if (!draft?.data) throw new HttpError(404, "No extraction data for this document.");
  const data = draftDataSchema.parse(draft.data);
  return { data, validation: validateDraft(data, await loadTeachers()) };
}

/**
 * Turns the reviewed draft into the live, normalised tables.
 * Nothing is visible to teachers until this runs.
 */
export async function publishDraft(documentId: string, userId: string, opts: { effectiveFrom?: string } = {}) {
  const doc = await db.uploadedDocument.findUnique({ where: { id: documentId }, include: { draft: true } });
  if (!doc || !doc.draft) throw new HttpError(404, "Document not found.");
  if (doc.draft.status !== "REVIEW") throw new HttpError(409, "This document is not waiting for review.");
  if (!doc.draft.data) throw new HttpError(409, "There is no extracted data to publish.");

  const data = draftDataSchema.parse(doc.draft.data);
  const teachers = await loadTeachers();
  const validation = validateDraft(data, teachers);
  if (!validation.canPublish) {
    throw new HttpError(422, `Fix ${validation.errors} error(s) before publishing.`, validation.issues.filter((i) => i.severity === "error"));
  }

  return db.$transaction(
    async (tx) => {
      // 1. teachers marked "create new" in the review (names that differ only in case/punctuation become one teacher)
      const created: Record<string, string> = {};
      const createdList: TeacherLite[] = [];
      for (const [raw, target] of Object.entries(data.teacherMap)) {
        if (target !== "NEW") continue;
        if (!(raw in validation.resolved) || validation.resolved[raw]) continue;
        const already = resolveTeacher(raw, buildTeacherIndex(createdList));
        if (already.id) {
          created[raw] = already.id;
          continue;
        }
        // name / code / designation as printed ("Mr. X" + "TGT-Maths"); serial numbers and heading text never become teachers
        const p = parseTeacherText(raw);
        if (p.kind === "garbage") continue;
        const printed = data.modDuties.find((m) => m.teacherName.trim() === raw.trim())?.designation ?? null;
        const code = p.kind === "code" ? p.code : (p.code ?? (printed && CODE_START.test(printed) ? printed : null));
        const designation = p.kind === "person" ? (p.designation ?? (printed && !CODE_START.test(printed) ? printed : null)) : null;
        const t = await tx.teacher.create({ data: { name: p.name, code, designation } });
        created[raw] = t.id;
        createdList.push({ id: t.id, name: p.name, code, aliases: [], active: true });
      }
      const index = buildTeacherIndex([...teachers, ...createdList]);
      const tid = (raw: string, depth = 0): string | null => {
        const t = raw.trim();
        if (!t) return null;
        if (created[t]) return created[t];
        const m = data.teacherMap[t];
        if (m?.startsWith("SAME:") && depth < 5) return tid(m.slice(5), depth + 1);
        return resolveTeacher(t, index, data.teacherMap).id;
      };

      // remember the admin's decisions: a name mapped to a teacher becomes an alias, so the next
      // upload matches it automatically
      for (const [raw, m] of Object.entries(data.teacherMap)) {
        if (m === "NEW") continue;
        const id = tid(raw);
        if (!id) continue;
        const t = await tx.teacher.findUnique({ where: { id } });
        if (!t) continue;
        const known = new Set([t.name, t.code ?? "", ...t.aliases].map(normalizeKey));
        if (!known.has(normalizeKey(raw)) && raw.trim()) {
          await tx.teacher.update({ where: { id }, data: { aliases: [...t.aliases, raw.trim()] } });
        }
      }

      const result: { routineId?: string; version?: number; scheduledFor?: string; counts: Record<string, number> } = { counts: {} };

      // 2. routine
      if (data.periods.length) {
        const agg = await tx.routine.aggregate({ _max: { version: true } });
        const version = (agg._max.version ?? 0) + 1;
        // a future start date keeps today's routine running until that day; otherwise it replaces it now
        const today = todayISO();
        const effective = opts.effectiveFrom && opts.effectiveFrom > today ? opts.effectiveFrom : today;
        const scheduled = effective > today;
        if (!scheduled) {
          await tx.routine.updateMany({
            where: { OR: [{ status: "ACTIVE" }, { status: "SCHEDULED", effectiveFrom: { lte: dateFromISO(today) } }] },
            data: { status: "ARCHIVED", archivedAt: new Date() },
          });
        }
        const routine = await tx.routine.create({
          data: {
            version,
            title: data.title || doc.title,
            session: data.session,
            status: scheduled ? "SCHEDULED" : "ACTIVE",
            effectiveFrom: dateFromISO(effective),
            documentId: doc.id,
            uploadedById: userId,
          },
        });

        const classKey = (c: string, s: string) => `${c}|${s}`;
        const classIds = new Map<string, string>();
        for (const p of data.periods) {
          const cn = normalizeClassName(p.className) ?? p.className;
          const k = classKey(cn, p.section);
          if (!classIds.has(k)) {
            const rc = await tx.routineClass.create({ data: { routineId: routine.id, className: cn, section: p.section } });
            classIds.set(k, rc.id);
          }
        }

        const subjectNames = [...new Set(data.periods.filter((p) => !p.isBreak && p.subject.trim()).map((p) => p.subject.trim()))];
        const subjectByKey = new Map<string, string>();
        for (const name of subjectNames) {
          const key = normalizeKey(name);
          if (subjectByKey.has(key)) continue;
          const s =
            (await tx.subject.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ??
            (await tx.subject.create({ data: { name } }));
          subjectByKey.set(key, s.id);
        }

        await tx.routinePeriod.createMany({
          data: data.periods.map((p) => {
            const cn = normalizeClassName(p.className) ?? p.className;
            return {
              routineId: routine.id,
              routineClassId: classIds.get(classKey(cn, p.section))!,
              className: cn,
              section: p.section,
              day: p.day,
              slot: p.slot,
              periodNumber: p.isBreak ? null : p.periodNumber,
              isBreak: p.isBreak,
              label: p.label,
              startTime: p.startTime,
              endTime: p.endTime,
              subject: p.subject,
              subjectId: p.isBreak ? null : (subjectByKey.get(normalizeKey(p.subject)) ?? null),
              teacherId: p.isBreak ? null : tid(p.teacherName),
              teacherName: p.teacherName,
              room: p.room,
              confidence: p.confidence,
            };
          }),
        });

        for (const day of new Set(data.periods.map((p) => p.day))) {
          await tx.schoolDay.upsert({ where: { day }, update: {}, create: { day } });
        }
        result.routineId = routine.id;
        result.version = version;
        if (scheduled) result.scheduledFor = effective;
        result.counts.periods = data.periods.length;
      }

      // 3. MOD duties printed in the document
      for (const m of data.modDuties) {
        const teacherId = tid(m.teacherName);
        if (!teacherId) continue;
        const t = await tx.teacher.findUnique({ where: { id: teacherId } });
        await tx.modDuty.upsert({
          where: { date_teacherId_dutyType: { date: dateFromISO(m.date), teacherId, dutyType: m.dutyType } },
          update: {
            dutyDescription: m.description || null, house: m.house, classes: m.classes,
            offDate: m.offDate ? dateFromISO(m.offDate) : null, documentId: doc.id,
          },
          create: {
            date: dateFromISO(m.date),
            day: weekdayOfISO(m.date),
            teacherId,
            teacherName: t?.name ?? m.teacherName,
            dutyDescription: m.description || null,
            dutyType: m.dutyType,
            house: m.house,
            classes: m.classes,
            offDate: m.offDate ? dateFromISO(m.offDate) : null,
            documentId: doc.id,
          },
        });
        // learn the printed code / designation for a teacher that does not have one yet
        if (t && m.designation) {
          if (CODE_START.test(m.designation) && !t.code) await tx.teacher.update({ where: { id: t.id }, data: { code: m.designation } });
          else if (!CODE_START.test(m.designation) && !t.designation) await tx.teacher.update({ where: { id: t.id }, data: { designation: m.designation } });
        }
      }
      result.counts.mod = data.modDuties.length;

      // 4. weekly offs printed in the document (replace that teacher's previous setting)
      const offTeachers = new Set<string>();
      for (const w of data.weeklyOffs) {
        const teacherId = tid(w.teacherName);
        if (!teacherId) continue;
        if (!offTeachers.has(teacherId)) {
          await tx.weeklyOff.deleteMany({ where: { teacherId } });
          offTeachers.add(teacherId);
        }
        await tx.weeklyOff.upsert({
          where: { teacherId_day: { teacherId, day: w.day } },
          update: { documentId: doc.id },
          create: { teacherId, day: w.day, documentId: doc.id },
        });
      }
      result.counts.weeklyOff = data.weeklyOffs.length;

      // 5. remedial / enrichment schedule replaces the previous one
      if (data.remedial.length) {
        await tx.remedialSchedule.updateMany({ where: { active: true }, data: { active: false } });
        await tx.remedialSchedule.createMany({
          data: data.remedial.map((r) => ({
            category: r.category,
            className: normalizeClassName(r.className) ?? r.className,
            section: r.section,
            day: r.day,
            startTime: r.startTime,
            endTime: r.endTime,
            activity: r.activity,
            teacherId: tid(r.teacherName),
            teacherName: r.teacherName,
            active: true,
            documentId: doc.id,
          })),
        });
        result.counts.remedial = data.remedial.length;
      }

      // 6. clubs replace the previous list
      if (data.clubs.length) {
        await tx.clubActivity.updateMany({ where: { active: true }, data: { active: false } });
        await tx.clubActivity.createMany({
          data: data.clubs.map((c) => ({
            name: c.name,
            members: c.teachers,
            activities: c.activities,
            active: true,
            documentId: doc.id,
          })),
        });
        result.counts.clubs = data.clubs.length;
      }

      await tx.extractionDraft.update({ where: { documentId }, data: { status: "PUBLISHED", stage: "Published", data: data as unknown as Prisma.InputJsonValue } });
      await tx.uploadedDocument.update({
        where: { id: documentId },
        data: { extractionStatus: "PUBLISHED", ...(data.kind === "REMEDIAL" && doc.kind === "ROUTINE" && data.remedial.length ? { kind: "REMEDIAL" as const } : {}),
          // a roster (MOD / holiday duty) uploaded as a "routine" is filed under Other documents
          ...(["ROUTINE", "REMEDIAL", "CLUB"].includes(doc.kind) && !data.periods.length && !data.remedial.length && !data.clubs.length && data.modDuties.length ? { kind: "OTHER" as const } : {}),
        },
      });
      await tx.extractionLog.create({
        data: { documentId, level: "INFO", stage: "publish", message: `Published by admin.`, meta: result.counts as Prisma.InputJsonValue },
      });
      return result;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
