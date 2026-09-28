import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { getDatedWeeklyOffs, getWeeklyOffByDay } from "@/lib/queries";
import { dateFromISO, dayLabel, formatDateShort, isoFromDate, todayISO, todayWeekday, weekdayOfISO, WEEKDAYS } from "@/lib/time";

export const metadata: Metadata = { title: "Weekly Off" };
export const dynamic = "force-dynamic";

export default async function WeeklyOffPage() {
  const iso = todayISO();
  const from = isoFromDate(new Date(dateFromISO(iso).getTime() - 45 * 86400000));
  const [byDay, dated] = await Promise.all([getWeeklyOffByDay(), getDatedWeeklyOffs(from)]);
  const today = todayWeekday();

  const byDate = new Map<string, typeof dated>();
  for (const d of dated) byDate.set(d.offISO, [...(byDate.get(d.offISO) ?? []), d]);

  if (!byDay.size && !dated.length) {
    return (
      <div>
        <PageHeader title="Weekly Off" />
        <Empty title="Not available">Information not available in uploaded document. The administrator can enter it manually.</Empty>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Weekly Off" subtitle="Teachers' weekly off" />

      {byDate.size > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-900">Weekly off on specific dates</h2>
          <p className="mb-3 text-xs text-slate-500">Compensatory weekly off for teachers who had Sunday / holiday duty, as printed in the duty list.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...byDate.entries()].map(([d, rows]) => {
              const past = d < iso;
              return (
                <div key={d} className={clsx("card overflow-hidden", d === iso && "ring-2 ring-amber-400", past && "opacity-60")}>
                  <div className={clsx("flex items-center justify-between px-4 py-2 text-sm font-bold", d === iso ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-700")}>
                    <span>{dayLabel(weekdayOfISO(d))}, {formatDateShort(d)}</span>
                    {d === iso && <span className="text-xs">TODAY</span>}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <Link href={`/teachers/${r.teacherId}`} className="block px-4 py-2.5 text-sm hover:bg-slate-50">
                          <span className="font-medium text-slate-900">{r.teacherName}</span>
                          <span className="block text-xs text-slate-500">after duty on {formatDateShort(r.dutyISO)}{r.house ? ` · ${r.house}` : ""}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {byDay.size > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Regular weekly off</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WEEKDAYS.filter((d) => byDay.has(d) || d !== "SUNDAY").map((d) => {
              const list = byDay.get(d) ?? [];
              return (
                <div key={d} className={clsx("card overflow-hidden", d === today && "ring-2 ring-amber-400")}>
                  <div className={clsx("flex items-center justify-between px-4 py-2 text-sm font-bold", d === today ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-700")}>
                    <span>{dayLabel(d)}</span>
                    {d === today && <Pill tone="gold">TODAY</Pill>}
                  </div>
                  {list.length ? (
                    <ul className="divide-y divide-slate-100">
                      {list.map((t) => (
                        <li key={t.id}>
                          <Link href={`/teachers/${t.id}`} className="block px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 hover:text-brand-700">{t.name}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-sm text-slate-400">—</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
