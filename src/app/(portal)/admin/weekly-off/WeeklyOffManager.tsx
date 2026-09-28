"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { dayLabel, WEEKDAYS } from "@/lib/common";

type Row = { id: string; name: string; day: string | null };

export default function WeeklyOffManager({ teachers }: { teachers: Row[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(teachers.map((t) => [t.id, t.day ?? ""])));

  async function change(id: string, day: string) {
    setValues((v) => ({ ...v, [id]: day }));
    setSaving(id);
    setError("");
    try {
      await api("/api/weekly-off", { method: "PUT", json: { teacherId: id, day: day || null } });
      setSaved(id);
      setTimeout(() => setSaved((s) => (s === id ? null : s)), 1500);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const list = teachers.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <input className="input max-w-xs" placeholder="Filter teachers..." value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead><tr><th className="th">Teacher</th><th className="th">Weekly off</th><th className="th w-10"></th></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td className="td font-medium">{t.name}</td>
                <td className="td">
                  <select className="input !w-48 !py-1.5" value={values[t.id]} onChange={(e) => change(t.id, e.target.value)} aria-label={`Weekly off for ${t.name}`}>
                    <option value="">Not set</option>
                    {WEEKDAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                  </select>
                </td>
                <td className="td">
                  {saving === t.id ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : saved === t.id ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={3} className="td text-slate-500">{teachers.length ? "No match." : "Add teachers first."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
