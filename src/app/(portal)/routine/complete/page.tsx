import type { Metadata } from "next";
import { TimetableGrid } from "@/components/Timetable";
import { Empty } from "@/components/ui";
import { classLabel, getActiveRoutine, getAllPeriods, getRoutineClasses } from "@/lib/queries";
import { todayWeekday } from "@/lib/time";

export const metadata: Metadata = { title: "Complete routine" };
export const dynamic = "force-dynamic";

export default async function CompleteView() {
  const routine = await getActiveRoutine();
  if (!routine) return <Empty title="No routine published yet">The routine will appear here once the administrator publishes it.</Empty>;
  const [classes, periods] = await Promise.all([getRoutineClasses(routine.id), getAllPeriods(routine.id)]);
  const today = todayWeekday();
  return (
    <div className="space-y-8">
      {classes.map((c) => (
        <section key={c.id} id={`class-${c.className}-${c.section}`}>
          <TimetableGrid
            title={`Class ${classLabel(c.className, c.section)}`}
            periods={periods.filter((p) => p.className === c.className && p.section === c.section)}
            highlightDay={today}
          />
        </section>
      ))}
    </div>
  );
}
