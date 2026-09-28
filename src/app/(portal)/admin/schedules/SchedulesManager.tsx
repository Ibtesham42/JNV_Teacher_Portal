"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { dayLabel, WEEKDAYS } from "@/lib/common";

type Club = { id: string; name: string; members: string[]; activities: string[] };
type Rem = { id: string; category: string; className: string; section: string; day: string | null; startTime: string | null; endTime: string | null; activity: string; teacherName: string };

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function SchedulesManager({ classes, sections, teachers, clubs, remedial }: { classes: string[]; sections: string[]; teachers: { id: string; name: string }[]; clubs: Club[]; remedial: Rem[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      {msg && <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{msg.text}</p>}

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Remedial & enrichment schedule</h2>
        <form
          className="card card-pad grid gap-3 sm:grid-cols-4 lg:grid-cols-8"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            run(
              () =>
                api("/api/remedial", {
                  method: "POST",
                  json: {
                    category: f.get("category"), className: f.get("className"), section: f.get("section") || "",
                    day: f.get("day") || null, startTime: f.get("start") || null, endTime: f.get("end") || null,
                    activity: f.get("activity"), teacherId: f.get("teacherId") || null,
                  },
                }).then(() => form.reset()),
              "Row added.",
            );
          }}
        >
          <div><label className="label">Type</label><select name="category" className="input"><option value="REMEDIAL">Remedial</option><option value="LIFE_SKILL">Life skill</option><option value="ENRICHMENT">Enrichment</option><option value="OTHER">Other</option></select></div>
          <div><label className="label">Class</label><select name="className" className="input" required>{classes.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">Section</label><select name="section" className="input"><option value="">—</option>{sections.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label className="label">Day</label><select name="day" className="input"><option value="">—</option>{WEEKDAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}</select></div>
          <div><label className="label">Start</label><input name="start" type="time" className="input" /></div>
          <div><label className="label">End</label><input name="end" type="time" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Activity</label><input name="activity" className="input" required maxLength={200} /></div>
          <div className="sm:col-span-2"><label className="label">Teacher</label><select name="teacherId" className="input"><option value="">—</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="flex items-end"><button className="btn btn-primary w-full" disabled={busy}>Add</button></div>
        </form>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr>{["Class", "Day", "Time", "Activity", "Teacher", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {remedial.map((r) => (
                <tr key={r.id}>
                  <td className="td font-semibold">{r.className}{r.section && `-${r.section}`}</td>
                  <td className="td">{r.day ? dayLabel(r.day) : "—"}</td>
                  <td className="td">{[r.startTime, r.endTime].filter(Boolean).join(" – ") || "—"}</td>
                  <td className="td"><span className="badge mr-1 bg-slate-100 text-slate-700">{r.category.replace("_", " ")}</span>{r.activity}</td>
                  <td className="td">{r.teacherName || "—"}</td>
                  <td className="td"><button className="text-slate-400 hover:text-red-600" aria-label="Delete" onClick={() => window.confirm("Delete this row?") && run(() => api(`/api/remedial/${r.id}`, { method: "DELETE" }), "Row deleted.")}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {!remedial.length && <tr><td colSpan={6} className="td text-slate-500">Information not available in uploaded document.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Clubs & activities</h2>
        <form
          className="card card-pad grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            run(() => api("/api/clubs", { method: "POST", json: { name: f.get("name"), members: lines(String(f.get("members") || "")), activities: lines(String(f.get("activities") || "")) } }).then(() => form.reset()), "Club added.");
          }}
        >
          <div><label className="label">Club name</label><input name="name" className="input" required maxLength={120} placeholder="e.g. Eco Club" /></div>
          <div><label className="label">Teacher members (one per line)</label><textarea name="members" className="input min-h-[70px]" /></div>
          <div><label className="label">Suggested activities (one per line)</label><textarea name="activities" className="input min-h-[70px]" /></div>
          <div><button className="btn btn-primary" disabled={busy}>Add club</button></div>
        </form>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clubs.map((c) => (
            <ClubCard key={c.id} club={c} run={run} busy={busy} />
          ))}
        </div>
        {!clubs.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">Information not available in uploaded document.</p>}
      </section>
    </div>
  );
}

function ClubCard({ club, run, busy }: { club: Club; run: (fn: () => Promise<unknown>, ok: string) => Promise<void>; busy: boolean }) {
  const [edit, setEdit] = useState(false);
  if (!edit) {
    return (
      <div className="card card-pad">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-brand-800">{club.name}</h3>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setEdit(true)}>Edit</button>
            <button className="text-slate-400 hover:text-red-600" aria-label="Delete club" onClick={() => window.confirm(`Delete ${club.name}?`) && run(() => api(`/api/clubs/${club.id}`, { method: "DELETE" }), "Club deleted.")}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Members: {club.members.join(", ") || "—"}</p>
        <p className="mt-1 text-xs text-slate-500">Activities: {club.activities.join("; ") || "—"}</p>
      </div>
    );
  }
  return (
    <form
      className="card card-pad space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => api(`/api/clubs/${club.id}`, { method: "PATCH", json: { name: f.get("name"), members: lines(String(f.get("members"))), activities: lines(String(f.get("activities"))) } }).then(() => setEdit(false)), "Club updated.");
      }}
    >
      <input name="name" defaultValue={club.name} className="input font-bold" required />
      <textarea name="members" defaultValue={club.members.join("\n")} className="input min-h-[70px]" aria-label="Members" />
      <textarea name="activities" defaultValue={club.activities.join("\n")} className="input min-h-[90px]" aria-label="Activities" />
      <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={busy}>Save</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setEdit(false)}>Cancel</button></div>
    </form>
  );
}
