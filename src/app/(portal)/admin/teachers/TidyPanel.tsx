"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/apiClient";

type Plan = {
  merges: { keepId: string; keepName: string; finalName: string; finalCode: string | null; mergedNames: string[] }[];
  deletes: { id: string; name: string; refs: number; reason: string }[];
  keeps: { id: string; name: string; reason: string }[];
  totalBefore: number;
  totalAfter: number;
};

export default function TidyPanel() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function preview() {
    setBusy(true);
    setMsg(null);
    try {
      setPlan((await api<{ plan: Plan }>("/api/teachers/cleanup")).plan);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!window.confirm("Apply the tidy-up? Duplicates are merged into one teacher and all routines, MOD and other records are moved to it. Headings/sentences that were never teachers are removed.")) return;
    setBusy(true);
    try {
      const r = await api<{ merged: number; deleted: number; remaining: number }>("/api/teachers/cleanup", { method: "POST" });
      setMsg({ ok: true, text: `Done: ${r.merged} duplicate(s) merged, ${r.deleted} non-teacher entr${r.deleted === 1 ? "y" : "ies"} removed. ${r.remaining} teachers remain.` });
      setPlan(null);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const nothing = plan && !plan.merges.length && !plan.deletes.length;

  return (
    <div className="card card-pad space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><Sparkles className="h-4 w-4 text-brand-600" /> Tidy up the teacher list</h2>
          <p className="text-xs text-slate-500">Merges the same person written several ways (serial numbers, name + code together) and removes heading text that was mistaken for teachers. You see the plan first.</p>
        </div>
        <button className="btn btn-secondary" onClick={preview} disabled={busy}>
          {busy && !plan && <Loader2 className="h-4 w-4 animate-spin" />} Check for problems
        </button>
      </div>

      {msg && <p role="status" className={msg.ok ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"}>{msg.text}</p>}
      {nothing && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">The list is already clean.</p>}

      {plan && !nothing && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            {plan.totalBefore} → {plan.totalAfter} teachers · {plan.merges.reduce((n, m) => n + m.mergedNames.length, 0)} to merge · {plan.deletes.length} to remove
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <p className="sticky top-0 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase text-slate-500">Merged into one teacher</p>
              <ul className="divide-y divide-slate-100 text-sm">
                {plan.merges.filter((m) => m.mergedNames.length).map((m) => (
                  <li key={m.keepId} className="px-3 py-2">
                    <span className="font-semibold text-slate-900">{m.finalName}</span>
                    {m.finalCode && <span className="ml-1 text-xs text-brand-700">({m.finalCode})</span>}
                    <span className="block text-xs text-slate-500">← {m.mergedNames.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <p className="sticky top-0 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase text-slate-500">Removed (not teachers)</p>
              <ul className="divide-y divide-slate-100 text-sm">
                {plan.deletes.map((d) => (
                  <li key={d.id} className="px-3 py-2 text-slate-700">{d.name}{d.refs > 0 && <span className="ml-1 text-xs text-amber-700">({d.refs} records use it)</span>}</li>
                ))}
                {!plan.deletes.length && <li className="px-3 py-2 text-slate-400">None</li>}
              </ul>
            </div>
          </div>
          {plan.keeps.length > 0 && (
            <p className="text-xs text-slate-500">Left for you to decide: {plan.keeps.map((k) => `${k.name} (${k.reason})`).join("; ")}</p>
          )}
          <button className="btn btn-primary" onClick={apply} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply tidy-up
          </button>
        </div>
      )}
    </div>
  );
}
