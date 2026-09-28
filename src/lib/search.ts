import { db } from "./db";
import { classRank, normalizeClassName } from "./extraction/normalize";
import { classLabel, getActiveRoutine, visibleDocumentWhere } from "./queries";

export type SearchResults = {
  teachers: { id: string; name: string; code: string | null; designation: string | null }[];
  classes: { className: string; section: string; label: string }[];
  subjects: { name: string; teachers: { id: string; name: string }[] }[];
  clubs: { id: string; name: string }[];
  notices: { id: string; title: string; date: Date }[];
  documents: { id: string; title: string; kind: string }[];
};

/** One search box for teachers, classes, subjects, clubs, notices and documents. */
export async function globalSearch(q: string, isAdmin = false): Promise<SearchResults> {
  const term = q.trim();
  const has = { contains: term, mode: "insensitive" as const };
  const routine = await getActiveRoutine();

  const [teachers, clubs, notices, documents, subjectRows, classRows] = await Promise.all([
    db.teacher.findMany({
      where: { active: true, OR: [{ name: has }, { code: has }, { designation: has }, { aliases: { has: term } }] },
      select: { id: true, name: true, code: true, designation: true },
      orderBy: { name: "asc" },
      take: 15,
    }),
    db.clubActivity.findMany({ where: { active: true, OR: [{ name: has }, { activities: { has: term } }] }, select: { id: true, name: true }, take: 10 }),
    db.notice.findMany({ where: { archived: false, OR: [{ title: has }, { description: has }] }, select: { id: true, title: true, date: true }, orderBy: { date: "desc" }, take: 10 }),
    db.uploadedDocument.findMany({
      where: { ...(isAdmin ? {} : (visibleDocumentWhere as any)), OR: [{ title: has }, { originalName: has }] },
      select: { id: true, title: true, kind: true },
      take: 10,
    }),
    routine
      ? db.routinePeriod.findMany({
          where: { routineId: routine.id, isBreak: false, subject: has, teacherId: { not: null } },
          select: { subject: true, teacher: { select: { id: true, name: true } } },
          distinct: ["subject", "teacherId"],
          take: 60,
        })
      : Promise.resolve([]),
    routine ? db.routineClass.findMany({ where: { routineId: routine.id } }) : Promise.resolve([]),
  ]);

  const subjects = new Map<string, Map<string, string>>();
  for (const r of subjectRows) {
    const m = subjects.get(r.subject) ?? new Map<string, string>();
    if (r.teacher) m.set(r.teacher.id, r.teacher.name);
    subjects.set(r.subject, m);
  }

  const wanted = term.toUpperCase().replace(/^CLASS\s*/, "").replace(/\s+/g, "");
  const cn = normalizeClassName(wanted.replace(/-[A-Z]$/, ""));
  const classes = classRows
    .filter((c) => (cn ? c.className === cn : false) && (!/-[A-Z]$/.test(wanted) || c.section === wanted.slice(-1)))
    .sort((a, b) => classRank(a.className) - classRank(b.className) || a.section.localeCompare(b.section))
    .map((c) => ({ className: c.className, section: c.section, label: classLabel(c.className, c.section) }));

  return {
    teachers,
    classes,
    subjects: [...subjects.entries()].map(([name, t]) => ({ name, teachers: [...t.entries()].map(([id, n]) => ({ id, name: n })) })),
    clubs,
    notices,
    documents,
  };
}
