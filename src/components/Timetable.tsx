import Link from "next/link";
import clsx from "clsx";
import { classLabel, byTime, type PeriodRow } from "@/lib/queries";
import { dayLabel, formatRange, ordinal, WEEKDAYS, type WeekdayName } from "@/lib/time";

type Slot = { slot: number; number: number | null; isBreak: boolean; label: string | null; start: string | null; end: string | null };

function slotsOf(periods: PeriodRow[]): Slot[] {
  const map = new Map<number, Slot>();
  for (const p of [...periods].sort((a, b) => a.slot - b.slot)) {
    const cur = map.get(p.slot);
    if (!cur) {
      map.set(p.slot, { slot: p.slot, number: p.periodNumber, isBreak: p.isBreak, label: p.label, start: p.startTime, end: p.endTime });
    } else if (!cur.start && p.startTime) {
      cur.start = p.startTime;
      cur.end = p.endTime;
    }
  }
  return [...map.values()].sort((a, b) => a.slot - b.slot);
}

function slotTitle(s: Slot): string {
  if (s.isBreak) return s.label ? s.label[0] + s.label.slice(1).toLowerCase() : "Break";
  return s.number != null ? `${ordinal(s.number)} Period` : "Period";
}

function Teacher({ p }: { p: PeriodRow }) {
  if (!p.teacherName) return <span className="text-slate-400">-</span>;
  return p.teacherId ? (
    <Link href={`/teachers/${p.teacherId}`} className="text-brand-700 hover:underline">
      {p.teacherName}
    </Link>
  ) : (
    <span>{p.teacherName}</span>
  );
}

/** Weekly (or single day) timetable of ONE class-section. Table on desktop, cards on phones. */
export function TimetableGrid({
  periods,
  days,
  highlightDay,
  title,
}: {
  periods: PeriodRow[];
  days?: WeekdayName[];
  highlightDay?: WeekdayName;
  title?: string;
}) {
  const daysToShow = (days ?? WEEKDAYS.filter((d) => periods.some((p) => p.day === d))) as WeekdayName[];
  const slots = slotsOf(periods);
  const cell = new Map<string, PeriodRow>();
  for (const p of periods) cell.set(`${p.day}|${p.slot}`, p);

  if (!daysToShow.length || !slots.length) return null;

  return (
    <div>
      {title && <h3 className="mb-2 text-base font-bold text-slate-900">{title}</h3>}

      {/* desktop */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="th sticky left-0 bg-slate-50">Day</th>
              {slots.map((s) => (
                <th key={s.slot} className={clsx("th text-center", s.isBreak && "bg-amber-50")}>
                  <div>{slotTitle(s)}</div>
                  <div className="mt-0.5 text-[11px] font-medium normal-case tracking-normal text-slate-400">{formatRange(s.start, s.end)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daysToShow.map((d) => (
              <tr key={d} className={clsx(d === highlightDay && "bg-brand-50/60")}>
                <td className={clsx("td sticky left-0 font-bold", d === highlightDay ? "bg-brand-50 text-brand-800" : "bg-white text-slate-700")}>
                  {dayLabel(d)}
                </td>
                {slots.map((s) => {
                  const p = cell.get(`${d}|${s.slot}`);
                  if (s.isBreak) return <td key={s.slot} className="td bg-amber-50 text-center text-xs font-semibold uppercase tracking-wide text-amber-700">{p ? "Break" : ""}</td>;
                  return (
                    <td key={s.slot} className="td text-center">
                      {p ? (
                        <>
                          <div className="font-semibold text-slate-900">{p.subject || <span className="text-slate-400">-</span>}</div>
                          <div className="text-xs"><Teacher p={p} /></div>
                        </>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* phones */}
      <div className="space-y-3 md:hidden">
        {daysToShow.map((d) => {
          const list = periods.filter((p) => p.day === d).sort(byTime);
          return (
            <div key={d} className={clsx("card overflow-hidden", d === highlightDay && "ring-2 ring-brand-400")}>
              <div className={clsx("px-4 py-2 text-sm font-bold", d === highlightDay ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700")}>{dayLabel(d)}</div>
              <ul className="divide-y divide-slate-100">
                {list.map((p) =>
                  p.isBreak ? (
                    <li key={p.id} className="bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Break · {formatRange(p.startTime, p.endTime)}
                    </li>
                  ) : (
                    <li key={p.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{p.periodNumber ?? "-"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-900">{p.subject || "-"}</span>
                        <span className="block text-xs text-slate-500"><Teacher p={p} /></span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-500">{formatRange(p.startTime, p.endTime)}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One teacher's classes for one day - the "today" list. */
export function DayList({ periods, emptyText }: { periods: PeriodRow[]; emptyText: string }) {
  if (!periods.length) return <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {periods.map((p) => (
        <li key={p.id} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{p.periodNumber ?? "-"}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{formatRange(p.startTime, p.endTime) || `Period ${p.periodNumber ?? ""}`}</p>
            <p className="text-sm text-slate-700">
              Class {classLabel(p.className, p.section)} · <span className="font-medium">{p.subject || "-"}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Teacher's whole week: a day-by-day list. */
export function TeacherWeek({ periods, todayDay }: { periods: PeriodRow[]; todayDay?: WeekdayName }) {
  const days = WEEKDAYS.filter((d) => periods.some((p) => p.day === d));
  if (!days.length) return <p className="text-sm text-slate-500">No periods are assigned to this teacher in the active routine.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {days.map((d) => (
        <div key={d} className={clsx("card overflow-hidden", d === todayDay && "ring-2 ring-brand-400")}>
          <div className={clsx("flex items-center justify-between px-4 py-2 text-sm font-bold", d === todayDay ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700")}>
            <span>{dayLabel(d)}</span>
            {d === todayDay && <span className="text-xs font-semibold text-gold-400">TODAY</span>}
          </div>
          <ul className="divide-y divide-slate-100">
            {periods
              .filter((p) => p.day === d)
              .sort(byTime)
              .map((p) => (
                <li key={p.id} className="px-4 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {p.periodNumber != null ? `${ordinal(p.periodNumber)} · ` : ""}
                      {classLabel(p.className, p.section)}
                    </span>
                    <span className="text-xs text-slate-500">{formatRange(p.startTime, p.endTime)}</span>
                  </div>
                  <div className="text-xs text-slate-600">{p.subject || "-"}</div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
