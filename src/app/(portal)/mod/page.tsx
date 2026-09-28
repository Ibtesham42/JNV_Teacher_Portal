import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Empty, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { getUpcomingMod, getModForDate, getHolidayDutyForDate, NOT_AVAILABLE } from "@/lib/queries";
import { dayLabel, formatDateLong, formatDateShort, todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "MOD & Holiday Duty" };
export const dynamic = "force-dynamic";

export default async function ModPage() {
  const iso = todayISO();
  const [today, holidayToday, upcomingMod, upcomingHoliday, totalMod, totalHoliday] = await Promise.all([
    getModForDate(iso),
    getHolidayDutyForDate(iso),
    getUpcomingMod(iso, 300, "MOD"),
    getUpcomingMod(iso, 300, "HOLIDAY"),
    db.modDuty.count({ where: { dutyType: "MOD" } }),
    db.modDuty.count({ where: { dutyType: "HOLIDAY" } }),
  ]);
  const futureMod = upcomingMod.filter((u) => u.iso > iso);
  const futureHoliday = upcomingHoliday.filter((u) => u.iso > iso);

  const group = <T extends { iso: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.iso, [...(m.get(r.iso) ?? []), r]);
    return m;
  };
  const modByDate = group(futureMod);
  const holidayByDate = group(futureHoliday);

  return (
    <div className="space-y-8">
      <PageHeader title="MOD & Holiday Duty" subtitle="Master on Duty, and Sunday / holiday duty (house, supervised study)" />

      <section className="card card-pad border-emerald-200 bg-emerald-50/50">
        <p className="section-title text-emerald-800">Today&apos;s MOD · {formatDateLong(iso)}</p>
        {today.length ? (
          <ol className="mt-2 space-y-1">
            {today.map((m, i) => (
              <li key={m.id} className="text-lg font-bold text-slate-900">
                <span className="mr-2 text-slate-400">{i + 1}.</span>
                <Link href={`/teachers/${m.teacherId}`} className="hover:text-brand-700 hover:underline">{m.teacherName}</Link>
                {m.dutyDescription && <span className="ml-2 text-sm font-normal text-slate-600">— {m.dutyDescription}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-base font-semibold text-slate-800">{totalMod ? "No MOD assigned for today." : NOT_AVAILABLE}</p>
        )}
      </section>

      {holidayToday.length > 0 && (
        <section className="card card-pad border-gold-400 bg-gold-50">
          <p className="section-title text-gold-600">Today&apos;s Sunday / Holiday duty</p>
          <ul className="mt-2 space-y-1.5">
            {holidayToday.map((h) => (
              <li key={h.id} className="text-base text-slate-900">
                <Link href={`/teachers/${h.teacherId}`} className="font-bold hover:text-brand-700 hover:underline">{h.teacherName}</Link>
                <span className="ml-2 text-sm text-slate-600">{h.dutyDescription}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">MOD Duty Schedule</h2>
        {modByDate.size ? (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr><th className="th">Date</th><th className="th">Day</th><th className="th">MOD</th></tr></thead>
              <tbody>
                {[...modByDate.entries()].map(([d, rows]) => (
                  <tr key={d}>
                    <td className="td font-semibold">{formatDateShort(d)}</td>
                    <td className="td"><Pill tone="blue">{dayLabel(rows[0].day)}</Pill></td>
                    <td className="td">
                      {rows.map((r, i) => (
                        <span key={r.id}>
                          {i > 0 && ", "}
                          <Link href={`/teachers/${r.teacherId}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{r.teacherName}</Link>
                          {r.dutyDescription && <span className="text-xs text-slate-500"> ({r.dutyDescription})</span>}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{totalMod ? "No upcoming MOD assignments." : NOT_AVAILABLE}</Empty>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Sunday / Holiday Duty</h2>
        <p className="mb-3 text-xs text-slate-500">Teachers on duty on Sundays and holidays, with the house, the classes they supervise, and the compensatory weekly off.</p>
        {holidayByDate.size ? (
          <div className="space-y-3">
            {[...holidayByDate.entries()].map(([d, rows]) => (
              <div key={d} className="card overflow-hidden">
                <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                  {formatDateShort(d)} <Pill tone="gold">{dayLabel(rows[0].day)}</Pill>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead><tr><th className="th">Teacher</th><th className="th">House</th><th className="th">Classes</th><th className="th">Weekly off</th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="td font-medium">
                            <Link href={`/teachers/${r.teacherId}`} className="text-slate-900 hover:text-brand-700 hover:underline">{r.teacherName}</Link>
                            {r.dutyDescription?.includes("MOD") && <span className="ml-1"><Pill tone="green">MOD</Pill></span>}
                          </td>
                          <td className="td">{r.house ?? "—"}</td>
                          <td className="td">{r.classes ?? "—"}</td>
                          <td className="td whitespace-nowrap">{r.offDate ? formatDateShort(r.offDate.toISOString().slice(0, 10)) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{totalHoliday ? "No upcoming Sunday / holiday duty." : NOT_AVAILABLE}</Empty>
        )}
      </section>
    </div>
  );
}
