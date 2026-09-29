import Link from "next/link";
import { CalendarOff, ClipboardCheck } from "lucide-react";
import { db } from "@/lib/db";
import DayStatusCard from "@/components/DayStatusCard";
import RoutineChangeAlert from "@/components/RoutineChangeAlert";
import { DayList, TeacherWeek } from "@/components/Timetable";
import { Empty, Pill } from "@/components/ui";
import { getActiveRoutine, getAllPeriods, getDatedWeeklyOffs, getModForDate, getTeacherPeriods, NOT_AVAILABLE } from "@/lib/queries";
import { affectsTeacher, describePeriod, describeSlot, diffPeriods } from "@/lib/routineDiff";
import { dateFromISO, dayLabel, formatDateLong, formatDateShort, greeting, isoFromDate, todayISO, todayWeekday, weekdayOfISO } from "@/lib/time";

/** Everything a teacher needs: today's classes, MOD, weekly off and the full week. */
export default async function TeacherSchedule({ teacherId, self = false, userName }: { teacherId: string; self?: boolean; userName?: string }) {
  const teacher = await db.teacher.findUnique({ where: { id: teacherId }, include: { weeklyOffs: true } });
  if (!teacher) return <Empty title="Teacher not found">This teacher is not in the teacher list.</Empty>;

  const iso = todayISO();
  const today = todayWeekday();
  const routine = await getActiveRoutine();
  const [weekPeriods, modToday, upcoming, todayRemedial] = await Promise.all([
    routine ? getTeacherPeriods(routine.id, teacher.id) : Promise.resolve([]),
    getModForDate(iso),
    db.modDuty.findMany({ where: { teacherId: teacher.id, date: { gte: dateFromISO(iso) } }, orderBy: { date: "asc" }, take: 20 }),
    db.remedialSchedule.findMany({ where: { active: true, teacherId: teacher.id, day: today }, select: { id: true, activity: true, startTime: true, endTime: true } }),
  ]);
  const todayPeriods = weekPeriods.filter((p) => p.day === today);
  const myMod = modToday.find((m) => m.teacherId === teacher.id);
  const offDays = teacher.weeklyOffs.map((w) => w.day);
  const datedOffs = (await getDatedWeeklyOffs(iso)).filter((o) => o.teacherId === teacher.id);
  const isOffToday = offDays.includes(today) || datedOffs.some((o) => o.offISO === iso);
  const totalMod = await db.modDuty.count({ where: { dutyType: "MOD" } });
  const upcomingMod = upcoming.filter((u) => u.dutyType === "MOD" && isoFromDate(u.date) > iso).slice(0, 6);
  const holidayNow = upcoming.find((u) => u.dutyType === "HOLIDAY" && isoFromDate(u.date) === iso);
  const upcomingHoliday = upcoming.filter((u) => u.dutyType === "HOLIDAY" && isoFromDate(u.date) > iso).slice(0, 6);

  let myChanges: { summary: string; before: string | null; after: string | null }[] = [];
  if (self && routine) {
    const previous = await db.routine.findFirst({ where: { status: "ARCHIVED", archivedAt: { not: null } }, orderBy: { archivedAt: "desc" } });
    if (previous) {
      const [prevPeriods, curPeriods] = await Promise.all([getAllPeriods(previous.id), getAllPeriods(routine.id)]);
      myChanges = diffPeriods(prevPeriods, curPeriods)
        .filter((d) => affectsTeacher(d, teacher.id))
        .map((d) => {
          const periodNumber = d.kind === "changed" ? d.after.periodNumber : d.period.periodNumber;
          return {
            summary: `${describeSlot(d)}${periodNumber != null ? `, Period ${periodNumber}` : ""}`,
            before: d.kind === "added" ? null : describePeriod(d.kind === "changed" ? d.before : d.period),
            after: d.kind === "removed" ? null : describePeriod(d.kind === "changed" ? d.after : d.period),
          };
        });
    }
  }

  return (
    <div className="space-y-6">
      <div className="card card-pad bg-gradient-to-r from-brand-800 to-brand-600 text-white">
        {self ? (
          <h1 className="text-2xl font-bold">
            {greeting()}, {userName ?? teacher.name}
          </h1>
        ) : (
          <h1 className="text-2xl font-bold">{teacher.name}</h1>
        )}
        <p className="mt-1 text-sm text-brand-100">{[teacher.designation, teacher.code].filter(Boolean).join(" · ")}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-brand-200">Today: </span>
            <strong>{formatDateLong(iso)}</strong>
          </span>
          <span>
            <span className="text-brand-200">Day: </span>
            <strong>{dayLabel(today)}</strong>
          </span>
        </div>
      </div>

      {self && routine && myChanges.length > 0 && (
        <RoutineChangeAlert version={routine.version} teacherId={teacher.id} changes={myChanges} />
      )}

      {isOffToday && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <CalendarOff className="h-5 w-5 shrink-0" />
          <p className="text-sm font-semibold">{self ? "Today is your weekly off." : `Today is ${teacher.name}'s weekly off.`}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card card-pad">
          <p className="section-title flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Today&apos;s MOD duty</p>
          {myMod ? (
            <div className="mt-2">
              <p className="text-2xl font-bold text-emerald-700">Today&apos;s MOD: YES</p>
              {myMod.dutyDescription && <p className="mt-1 text-sm text-slate-700">{myMod.dutyDescription}</p>}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-lg font-semibold text-slate-800">{totalMod ? "No MOD duty assigned today." : "Not available"}</p>
              {!totalMod && <p className="text-xs text-slate-500">{NOT_AVAILABLE}</p>}
            </div>
          )}
          {upcomingMod.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-semibold text-slate-500">Upcoming MOD dates</p>
              <div className="flex flex-wrap gap-1.5">
                {upcomingMod.map((u) => (
                  <Pill key={u.id} tone="blue">{formatDateShort(isoFromDate(u.date))}</Pill>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <p className="section-title flex items-center gap-2"><CalendarOff className="h-4 w-4" /> {self ? "My weekly off" : "Weekly off"}</p>
          {offDays.length || datedOffs.length ? (
            <>
              {offDays.length > 0 && <p className="mt-2 text-2xl font-bold text-slate-900">{offDays.map(dayLabel).join(", ")}</p>}
              {datedOffs.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-slate-800">
                  {datedOffs.map((o) => (
                    <li key={o.id}>
                      <strong>{dayLabel(weekdayOfISO(o.offISO))}, {formatDateShort(o.offISO)}</strong>
                      <span className="text-xs text-slate-500"> · off after duty on {formatDateShort(o.dutyISO)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-semibold text-slate-800">Not available</p>
              <p className="text-xs text-slate-500">{NOT_AVAILABLE}</p>
            </>
          )}
        </div>
      </div>

      {(holidayNow || upcomingHoliday.length > 0) && (
        <div className="card card-pad border-gold-400 bg-gold-50">
          <p className="section-title text-gold-600">Sunday / Holiday duty</p>
          {holidayNow && (
            <p className="mt-1 text-base font-bold text-slate-900">
              Today: {[holidayNow.house, holidayNow.classes ? `Class ${holidayNow.classes}` : null].filter(Boolean).join(" · ") || "on duty"}
            </p>
          )}
          {upcomingHoliday.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {upcomingHoliday.map((u) => (
                <li key={u.id}>
                  <strong>{formatDateShort(isoFromDate(u.date))}</strong>
                  {u.house ? ` · ${u.house}` : ""}{u.classes ? ` · Class ${u.classes}` : ""}
                  {u.offDate ? ` · weekly off ${formatDateShort(isoFromDate(u.offDate))}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {routine && <DayStatusCard periods={todayPeriods} remedial={todayRemedial} isOff={isOffToday} />}

      <section>
        <h2 className="mb-2 text-lg font-bold text-slate-900">Today&apos;s classes</h2>
        {routine ? (
          <DayList
            periods={todayPeriods}
            emptyText={isOffToday ? "Weekly off - no classes today." : "No classes scheduled today."}
          />
        ) : (
          <Empty title="No routine published yet">The administrator has not published a routine.</Empty>
        )}
      </section>

      {routine && (
        <section>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-lg font-bold text-slate-900">Weekly timetable</h2>
            <span className="text-xs text-slate-500">
              {routine.title} · v{routine.version}
            </span>
          </div>
          <TeacherWeek periods={weekPeriods} todayDay={today} />
        </section>
      )}

      {!self && (
        <Link href="/routine/teacher" className="btn btn-secondary">
          Search another teacher
        </Link>
      )}
    </div>
  );
}
