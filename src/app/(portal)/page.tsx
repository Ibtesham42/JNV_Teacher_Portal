import Link from "next/link";
import clsx from "clsx";
import { Calendar, CalendarOff, ClipboardCheck, FileText, Megaphone, Sun } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import TeacherSearch from "@/components/TeacherSearch";
import { TimetableGrid } from "@/components/Timetable";
import { DocLinks, Empty, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import {
  classLabel, getActiveRoutine, getDayPeriods, getLatestNotices, getModForDate, getHolidayDutyForDate, getDatedWeeklyOffs, getOfficialDocuments,
  getRoutineClasses, getWeeklyOffByDay, NOT_AVAILABLE,
} from "@/lib/queries";
import { pageUser } from "@/lib/session";
import { dayLabel, formatDateLong, formatDateShort, isoFromDate, todayISO, todayWeekday } from "@/lib/time";

export const dynamic = "force-dynamic";

const priorityTone = { URGENT: "red", HIGH: "amber", NORMAL: "blue", LOW: "slate" } as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await pageUser();
  const sp = await searchParams;
  const iso = todayISO();
  const today = todayWeekday();

  const routine = await getActiveRoutine();
  const [mod, totalMod, offByDay, notices, docs, classes, holidayToday, datedOffs] = await Promise.all([
    getModForDate(iso),
    db.modDuty.count({ where: { dutyType: "MOD" } }),
    getWeeklyOffByDay(),
    getLatestNotices(4),
    getOfficialDocuments(),
    routine ? getRoutineClasses(routine.id) : Promise.resolve([]),
    getHolidayDutyForDate(iso),
    getDatedWeeklyOffs(iso),
  ]);

  const classNames = [...new Set(classes.map((c) => c.className))];
  const selected = classNames.includes(sp.c ?? "") ? sp.c! : classNames[0];
  const todayPeriods = routine && selected ? await getDayPeriods(routine.id, today, selected) : [];
  const sectionsOfSelected = classes.filter((c) => c.className === selected);
  // recurring weekly off for today's weekday + teachers whose printed compensatory off date is today
  const offToday = [...(offByDay.get(today) ?? []), ...datedOffs.filter((o) => o.offISO === iso).map((o) => ({ id: o.teacherId, name: o.teacherName }))].filter(
    (t, i, a) => a.findIndex((x) => x.id === t.id) === i,
  );
  const offAny = offByDay.size > 0 || datedOffs.length > 0;

  return (
    <div className="space-y-6">
      {/* banner */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 shadow-card">
        <div className="h-1.5 bg-gradient-to-r from-gold-500 via-white to-leaf-600" aria-hidden="true" />
        <div className="flex flex-col items-center gap-4 px-5 py-7 text-center text-white sm:flex-row sm:gap-6 sm:px-8 sm:py-9 sm:text-left">
          <BrandLogo size="xl" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gold-400" lang="hi">जवाहर नवोदय विद्यालय, रिम्बाई</p>
            <h1 className="mt-0.5 text-xl font-extrabold tracking-wide sm:text-3xl">{config.schoolName}</h1>
            <p className="mt-1 text-xs font-medium tracking-wider text-brand-100 sm:text-sm">{config.schoolAddress}</p>
            <p className="mt-3 inline-block rounded-full bg-white/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-gold-400 ring-1 ring-white/20 sm:text-sm">
              {config.portalName}
            </p>
          </div>
        </div>
      </section>

      {/* key facts */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="grid grid-cols-2 gap-4 md:contents">
          <div className="card card-pad">
            <p className="section-title flex items-center gap-2"><Calendar className="h-4 w-4 shrink-0" /> Today&apos;s date</p>
            <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{formatDateLong(iso)}</p>
          </div>
          <div className="card card-pad">
            <p className="section-title flex items-center gap-2"><Sun className="h-4 w-4 shrink-0" /> Today&apos;s day</p>
            <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{dayLabel(today)}</p>
          </div>
        </div>

        <div className="card card-pad border-emerald-200 bg-emerald-50/50">
          <p className="section-title flex items-center gap-2 text-emerald-800"><ClipboardCheck className="h-4 w-4" /> Today&apos;s MOD</p>
          {mod.length ? (
            <ol className="mt-1 space-y-0.5">
              {mod.map((m, i) => (
                <li key={m.id} className="text-base font-bold text-slate-900">
                  {mod.length > 1 && <span className="mr-1 text-slate-400">{i + 1}.</span>}
                  <Link href={`/teachers/${m.teacherId}`} className="hover:text-brand-700 hover:underline">{m.teacherName}</Link>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <p className="mt-1 text-base font-semibold text-slate-800">{totalMod ? "No MOD assigned for today" : "Not available"}</p>
              {!totalMod && <p className="text-xs text-slate-500">{NOT_AVAILABLE}</p>}
            </>
          )}
          <Link href="/mod" className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">MOD duty schedule →</Link>
        </div>

        <div className="card card-pad border-amber-200 bg-amber-50/50">
          <p className="section-title flex items-center gap-2 text-amber-800"><CalendarOff className="h-4 w-4" /> Weekly off · {dayLabel(today)}</p>
          {offToday.length ? (
            <p className="mt-1 text-base font-bold text-slate-900">
              {offToday.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link href={`/teachers/${t.id}`} className="hover:text-brand-700 hover:underline">{t.name}</Link>
                </span>
              ))}
            </p>
          ) : (
            <>
              <p className="mt-1 text-base font-semibold text-slate-800">{offAny ? "No one is off today" : "Not available"}</p>
              {!offAny && <p className="text-xs text-slate-500">{NOT_AVAILABLE}</p>}
            </>
          )}
          <Link href="/weekly-off" className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">Full weekly-off list →</Link>
        </div>
      </section>

      {holidayToday.length > 0 && (
        <section className="rounded-xl border border-gold-400 bg-gold-50 px-4 py-3">
          <p className="section-title text-gold-600">Today&apos;s Sunday / Holiday duty</p>
          <ul className="mt-1 grid gap-x-6 gap-y-1 text-sm text-slate-800 sm:grid-cols-2">
            {holidayToday.map((h) => (
              <li key={h.id}>
                <Link href={`/teachers/${h.teacherId}`} className="font-semibold hover:text-brand-700 hover:underline">{h.teacherName}</Link>
                {h.house && <span className="text-slate-600"> · {h.house}</span>}
                {h.classes && <span className="text-slate-600"> · Class {h.classes}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* search */}
      <section className="card card-pad">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Search Teacher</h2>
        <TeacherSearch big placeholder="Search teacher name..." />
        {user.teacherId && (
          <Link href="/me" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">View my own schedule →</Link>
        )}
      </section>

      {/* today's routine */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Today&apos;s Routine <span className="text-sm font-medium text-slate-500">· {dayLabel(today)}</span></h2>
          {routine && <Link href="/routine/today" className="text-sm font-semibold text-brand-700 hover:underline">All classes today →</Link>}
        </div>
        {!routine ? (
          <Empty title="No routine published yet">
            {user.role === "ADMIN" ? (
              <>Upload a routine document from the <Link href="/admin/upload" className="font-semibold text-brand-700 underline">admin dashboard</Link>.</>
            ) : (
              "The routine will appear here once the administrator publishes it."
            )}
          </Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2" aria-label="Classes">
              {classNames.map((c) => (
                <Link
                  key={c}
                  href={`/?c=${c}`}
                  className={clsx("rounded-lg px-4 py-2 text-sm font-bold", c === selected ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")}
                >
                  Class {c}
                </Link>
              ))}
            </div>
            <div className="space-y-5">
              {sectionsOfSelected.map((sec) => (
                <TimetableGrid
                  key={sec.id}
                  title={`Class ${classLabel(sec.className, sec.section)}`}
                  periods={todayPeriods.filter((p) => p.section === sec.section)}
                  days={[today]}
                  highlightDay={today}
                />
              ))}
              {!todayPeriods.length && <Empty>No classes are scheduled for Class {selected} today.</Empty>}
            </div>
          </>
        )}
      </section>

      {/* class shortcuts */}
      {classNames.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Class Routines</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {classNames.map((c) => {
              const secs = classes.filter((x) => x.className === c);
              return (
                <Link key={c} href={`/routine/class?class=${c}`} className="card card-pad text-center transition hover:border-brand-400 hover:shadow-md">
                  <p className="text-2xl font-extrabold text-brand-800">Class {c}</p>
                  <p className="mt-1 text-xs text-slate-500">{secs.some((s) => s.section) ? `Sections ${secs.map((s) => s.section).filter(Boolean).join(", ")}` : "Weekly timetable"}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Megaphone className="h-5 w-5 text-brand-700" /> Latest Notices</h2>
            <Link href="/notices" className="text-sm font-semibold text-brand-700 hover:underline">All notices →</Link>
          </div>
          {notices.length ? (
            <ul className="space-y-3">
              {notices.map((n) => (
                <li key={n.id} className="card card-pad">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={priorityTone[n.priority]}>{n.priority}</Pill>
                    <span className="text-xs text-slate-500">{formatDateShort(isoFromDate(n.date))}</span>
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">{n.title}</p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">{n.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No notices yet.</Empty>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileText className="h-5 w-5 text-brand-700" /> Official Documents</h2>
            <Link href="/documents" className="text-sm font-semibold text-brand-700 hover:underline">All documents →</Link>
          </div>
          {docs.length ? (
            <ul className="space-y-3">
              {docs.slice(0, 5).map((d) => (
                <li key={d.id} className="card card-pad flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{d.title}</p>
                    <p className="text-xs text-slate-500">{formatDateShort(isoFromDate(d.createdAt))}</p>
                  </div>
                  <DocLinks id={d.id} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No official documents yet.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}
