import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, ClipboardCheck, FilePlus2, Megaphone, Settings, Upload, Users } from "lucide-react";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { db } from "@/lib/db";
import { getActiveRoutine, getDashboardCounts, getModForDate, getWeeklyOffByDay } from "@/lib/queries";
import { dayLabel, formatDateShort, isoFromDate, todayISO, todayWeekday } from "@/lib/time";

export const metadata: Metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

const statusTone = { REVIEW: "amber", PROCESSING: "blue", QUEUED: "blue", FAILED: "red" } as const;

export default async function AdminDashboard() {
  const iso = todayISO();
  const today = todayWeekday();
  const [counts, routine, mod, off, pending] = await Promise.all([
    getDashboardCounts(),
    getActiveRoutine(),
    getModForDate(iso),
    getWeeklyOffByDay(),
    db.uploadedDocument.findMany({
      where: { extractionStatus: { in: ["REVIEW", "PROCESSING", "QUEUED", "FAILED"] }, archived: false },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const offToday = off.get(today) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" subtitle="Manage the routine, teachers, MOD duty and notices" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total teachers" value={counts.teachers} href="/admin/teachers" />
        <StatCard
          label="Active routine"
          value={routine ? `v${routine.version}` : "None"}
          hint={routine ? `${routine.title}${routine.session ? " · " + routine.session : ""}` : "Upload a routine to get started"}
          href="/admin/routines"
        />
        <StatCard
          label="Today's MOD"
          value={mod.length ? mod.length : "—"}
          hint={mod.length ? mod.map((m) => m.teacherName).join(", ") : "No MOD assigned for today"}
          href="/admin/mod"
        />
        <StatCard
          label={`Weekly off · ${dayLabel(today)}`}
          value={offToday.length || "—"}
          hint={offToday.length ? offToday.map((t) => t.name).join(", ") : "No one is off today"}
          href="/admin/weekly-off"
        />
        <StatCard label="Uploaded documents" value={counts.documents} href="/admin/documents" />
        <StatCard label="Pending extraction reviews" value={counts.pending} href="/admin/documents" tone={counts.pending ? "warn" : "default"} />
        <StatCard label="Published routines" value={counts.published} href="/admin/routines" />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { href: "/admin/upload?kind=ROUTINE", label: "Upload Routine", icon: Upload },
            { href: "/admin/upload?kind=REMEDIAL", label: "Upload Schedule", icon: FilePlus2 },
            { href: "/admin/teachers", label: "Manage Teachers", icon: Users },
            { href: "/admin/mod", label: "Manage MOD", icon: ClipboardCheck },
            { href: "/admin/weekly-off", label: "Manage Weekly Off", icon: CalendarOff },
            { href: "/admin/notices", label: "Manage Notices", icon: Megaphone },
            { href: "/admin/settings", label: "School Settings", icon: Settings },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="card card-pad flex flex-col items-center gap-2 text-center text-sm font-semibold text-brand-800 transition hover:border-brand-400 hover:shadow-md">
              <a.icon className="h-6 w-6" />
              {a.label}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Documents needing attention</h2>
        {pending.length ? (
          <ul className="space-y-2">
            {pending.map((d) => (
              <li key={d.id} className="card card-pad flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{d.title}</p>
                  <p className="text-xs text-slate-500">{d.kind} · uploaded {formatDateShort(isoFromDate(d.createdAt))}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={statusTone[d.extractionStatus as keyof typeof statusTone] ?? "slate"}>{d.extractionStatus}</Pill>
                  <Link href={`/admin/review/${d.id}`} className="btn btn-primary btn-sm">{d.extractionStatus === "REVIEW" ? "Review" : "Open"}</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">Nothing is waiting for review.</p>
        )}
      </section>
    </div>
  );
}
