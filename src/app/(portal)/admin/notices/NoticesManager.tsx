"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/apiClient";

type N = { id: string; title: string; description: string; date: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; archived: boolean; attachment: { id: string; name: string } | null };

const tone = { URGENT: "bg-red-100 text-red-800", HIGH: "bg-amber-100 text-amber-800", NORMAL: "bg-brand-100 text-brand-800", LOW: "bg-slate-100 text-slate-700" };

export default function NoticesManager({ today, notices }: { today: string; notices: N[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notices", { method: "POST", body: new FormData(form), credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save the notice.");
      form.reset();
      setMsg({ ok: true, text: "Notice published." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form onSubmit={create} className="card card-pad space-y-3 lg:col-span-2">
        <h2 className="font-bold text-slate-900">New notice</h2>
        <div><label className="label" htmlFor="n-title">Title</label><input id="n-title" name="title" className="input" required maxLength={160} /></div>
        <div><label className="label" htmlFor="n-desc">Description</label><textarea id="n-desc" name="description" className="input min-h-[120px]" required maxLength={5000} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="n-date">Date</label><input id="n-date" name="date" type="date" className="input" defaultValue={today} required /></div>
          <div>
            <label className="label" htmlFor="n-pri">Priority</label>
            <select id="n-pri" name="priority" className="input" defaultValue="NORMAL">
              <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>
        <div><label className="label" htmlFor="n-file">Attachment (optional)</label><input id="n-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="input" /></div>
        {msg && <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{msg.text}</p>}
        <button className="btn btn-primary" disabled={busy}>Publish notice</button>
      </form>

      <div className="space-y-3 lg:col-span-3">
        {notices.map((n) => (
          <div key={n.id} className={clsx("card card-pad", n.archived && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx("badge", tone[n.priority])}>{n.priority}</span>
              <span className="text-xs text-slate-500">{n.date}</span>
              {n.archived && <span className="badge bg-slate-100 text-slate-600">Archived</span>}
              <div className="ml-auto flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => act(() => api(`/api/notices/${n.id}`, { method: "PATCH", json: { archived: !n.archived } }))}>{n.archived ? "Restore" : "Archive"}</button>
                <button className="text-slate-400 hover:text-red-600" aria-label="Delete notice" onClick={() => window.confirm("Delete this notice permanently?") && act(() => api(`/api/notices/${n.id}`, { method: "DELETE" }))}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="mt-1 font-semibold text-slate-900">{n.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{n.description}</p>
            {n.attachment && <a className="mt-2 inline-block text-xs font-semibold text-brand-700 underline" href={`/api/documents/${n.attachment.id}/file`} target="_blank" rel="noopener noreferrer">{n.attachment.name}</a>}
          </div>
        ))}
        {!notices.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">No notices yet.</p>}
      </div>
    </div>
  );
}
