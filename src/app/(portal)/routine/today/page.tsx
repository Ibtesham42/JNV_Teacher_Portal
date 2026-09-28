import type { Metadata } from "next";
import { TimetableGrid } from "@/components/Timetable";
import { Empty } from "@/components/ui";
import { classLabel, getActiveRoutine, getDayPeriods, getRoutineClasses } from "@/lib/queries";
import { dayLabel, formatDateLong, todayISO, todayWeekday } from "@/lib/time";

export const metadata: Metadata = { title: "Today's routine" };
export const dynamic = "force-dynamic";

export default async function TodayView() {
  const routine = await getActiveRoutine();
  if (!routine) return <Empty title="No routine published yet">The routine will appear here once the administrator publishes it.</Empty>;
  const today = todayWeekday();
  const [classes, periods] = await Promise.all([getRoutineClasses(routine.id), getDayPeriods(routine.id, today)]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        {dayLabel(today)}, {formatDateLong(todayISO())}
      </p>
      {periods.length === 0 && <Empty>No classes are scheduled for {dayLabel(today)}.</Empty>}
      {classes.map((c) => {
        const list = periods.filter((p) => p.className === c.className && p.section === c.section);
        return list.length ? <TimetableGrid key={c.id} title={`Class ${classLabel(c.className, c.section)}`} periods={list} days={[today]} highlightDay={today} /> : null;
      })}
    </div>
  );
}
