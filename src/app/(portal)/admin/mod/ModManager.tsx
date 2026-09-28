"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { dayLabel } from "@/lib/common";

type Duty = { id: string; date: string; day: string; teacherName: string; description: string | null; dutyType: "MOD" | "HOLIDAY" };

function datesBetween(a: string, b: string): string[] {
  const out: string[] = [];
  const end = new Date(`${b}T00:00:00Z`).getTime();
  for (let t = new Date(`${a}T00:00:00Z`).getTime(); t <= end && out.length < 62; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export default function ModManager({ today, teachers, duties }: { today: string; teachers: { id: string; name: string }[]; duties: Duty[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [desc, setDesc] = useState("");
  const [dutyType, setDutyType] = useState<"MOD" | "HOLIDAY">("MOD");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(() => teachers.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())), [teachers, filter]);
  const dates = useMemo(() => (from ? datesBetween(from, to && to >= from ? to : from) : []), [from, to]);

  async function assign() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ count: number }>("/api/mod", { method: "POST", json: { dates, teacherIds: picked, dutyDescription: desc || null, dutyType } });
      setMsg({ ok: true, text: `${r.count} MOD assignment(s) saved.` });
      setPicked([]);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/mod/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  const byDate = new Map<string, Duty[]>();
  for (const d of duties) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="card card-pad space-y-4 lg:col-span-2">
        <h2 className="font-bold text-slate-900">Assign duty</h2>
        <div>
          <label className="label" htmlFor="mod-type">Type</label>
          <select id="mod-type" className="input" value={dutyType} onChange={(e) => setDutyType(e.target.value as "MOD" | "HOLIDAY")}>
            <option value="MOD">MOD (master on duty)</option>
            <option value="HOLIDAY">Sunday / holiday duty</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="mod-from">From date</label><input id="mod-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label" htmlFor="mod-to">To date (optional)</label><input id="mod-to" type="date" className="input" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <p className="text-xs text-slate-500">{dates.length} day(s) selected.</p>
        <div>
          <label className="label" htmlFor="mod-filter">Teachers ({picked.length} selected)</label>
          <input id="mod-filter" className="input mb-2" placeholder="Filter..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            {shown.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50">
                <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} />
                {t.name}
              </label>
            ))}
            {!shown.length && <p className="px-3 py-3 text-sm text-slate-500">{teachers.length ? "No match." : "Add teachers first."}</p>}
          </div>
        </div>
        <div><label className="label" htmlFor="mod-desc">Duty details (optional)</label><input id="mod-desc" className="input" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} placeholder="e.g. Morning assembly & dining hall" /></div>
        {msg && <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{msg.text}</p>}
        <button className="btn btn-primary w-full" onClick={assign} disabled={busy || !picked.length || !dates.length}>Save assignment</button>
      </div>

      <div className="lg:col-span-3">
        <h2 className="mb-3 font-bold text-slate-900">Recent & upcoming MOD</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr>{["Date", "Day", "Teacher", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {[...byDate.entries()].map(([date, rows]) =>
                rows.map((r, i) => (
                  <tr key={r.id} className={date === today ? "bg-emerald-50/60" : date < today ? "opacity-60" : ""}>
                    <td className="td font-semibold">{i === 0 ? date : ""}{i === 0 && date === today && <span className="ml-1 text-xs text-emerald-700">today</span>}</td>
                    <td className="td">{i === 0 ? dayLabel(r.day) : ""}</td>
                    <td className="td">{r.teacherName}{r.dutyType === "HOLIDAY" && <span className="ml-1 rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-bold text-gold-600">HOLIDAY</span>}{r.description && <span className="text-xs text-slate-500"> — {r.description}</span>}</td>
                    <td className="td"><button className="text-slate-400 hover:text-red-600" onClick={() => remove(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                )),
              )}
              {!duties.length && <tr><td colSpan={4} className="td text-slate-500">No MOD entered yet. Information not available in uploaded document.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
