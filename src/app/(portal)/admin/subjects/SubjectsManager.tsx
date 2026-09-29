"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/apiClient";

type Subject = { id: string; name: string; periodCount: number };

export default function SubjectsManager({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const list = useMemo(
    () => subjects.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())),
    [subjects, q],
  );

  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await run(() => api("/api/subjects", { method: "POST", json: { name: name.trim() } }), "Subject added.");
    setName("");
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    await run(() => api(`/api/subjects/${id}`, { method: "PATCH", json: { name: editName.trim() } }), "Subject renamed.");
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      {msg && <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{msg.text}</p>}

      <form onSubmit={add} className="card card-pad flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label className="label" htmlFor="subj-name">Add a subject</label>
          <input id="subj-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Physics" />
        </div>
        <button className="btn btn-primary" disabled={busy || !name.trim()}><Plus className="h-4 w-4" /> Add</button>
      </form>

      <input className="input max-w-xs" placeholder="Filter subjects..." value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr>{["Subject", "Used in", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                {editing === s.id ? (
                  <td colSpan={3} className="td">
                    <div className="flex items-center gap-2">
                      <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} autoFocus />
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => rename(s.id)}>Save</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="td font-semibold text-slate-900">{s.name}</td>
                    <td className="td text-xs text-slate-500">{s.periodCount} period(s)</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s.id); setEditName(s.name); }}><Pencil className="h-3 w-3" /> Rename</button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            window.confirm(`Delete subject "${s.name}"?`) &&
                            run(() => api(`/api/subjects/${s.id}`, { method: "DELETE" }), "Subject deleted.")
                          }
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!list.length && <tr><td colSpan={3} className="td text-slate-500">No subjects yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
