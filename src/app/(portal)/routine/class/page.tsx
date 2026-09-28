import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { TimetableGrid } from "@/components/Timetable";
import { Empty } from "@/components/ui";
import { classLabel, getActiveRoutine, getClassPeriods, getRoutineClasses } from "@/lib/queries";
import { todayWeekday } from "@/lib/time";

export const metadata: Metadata = { title: "Class routine" };
export const dynamic = "force-dynamic";

export default async function ClassView({ searchParams }: { searchParams: Promise<{ class?: string; section?: string }> }) {
  const sp = await searchParams;
  const routine = await getActiveRoutine();
  if (!routine) return <Empty title="No routine published yet">The routine will appear here once the administrator publishes it.</Empty>;

  const classes = await getRoutineClasses(routine.id);
  const classNames = [...new Set(classes.map((c) => c.className))];
  const className = classNames.includes(sp.class ?? "") ? sp.class! : classNames[0];
  const sections = classes.filter((c) => c.className === className);
  const section = sections.some((s) => s.section === sp.section) ? sp.section! : sections[0]?.section ?? "";
  const periods = className ? await getClassPeriods(routine.id, className, section) : [];

  const chip = (active: boolean) =>
    clsx("rounded-lg px-4 py-2 text-sm font-bold", active ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100");

  return (
    <div className="space-y-4">
      <div>
        <p className="section-title mb-2">Class</p>
        <div className="flex flex-wrap gap-2">
          {classNames.map((c) => (
            <Link key={c} href={`/routine/class?class=${c}`} className={chip(c === className)}>
              {c}
            </Link>
          ))}
        </div>
      </div>
      {sections.length > 1 || (sections.length === 1 && sections[0].section) ? (
        <div>
          <p className="section-title mb-2">Section</p>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <Link key={s.id} href={`/routine/class?class=${className}&section=${s.section}`} className={chip(s.section === section)}>
                {s.section || "—"}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <TimetableGrid title={`Class ${classLabel(className, section)} — weekly timetable`} periods={periods} highlightDay={todayWeekday()} />
      {!periods.length && <Empty>No timetable for this class.</Empty>}
    </div>
  );
}
