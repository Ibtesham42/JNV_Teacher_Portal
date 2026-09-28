"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { formatBytes } from "@/lib/common";
import type { DocCandidate } from "@/lib/storageCleanup";

export default function DocCleanup({ candidates }: { candidates: DocCandidate[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.filter((c) => c.preselect).map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const chosen = candidates.filter((c) => picked.has(c.id));
  const chosenBytes = chosen.reduce((n, c) => n + c.sizeBytes, 0);

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function run() {
    if (!chosen.length) return;
    if (!window.confirm(`Permanently delete ${chosen.length} document(s) (${formatBytes(chosenBytes)})? The files cannot be recovered. Data already published from them stays on the website.`)) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await api<{ message: string }>("/api/admin/storage", { method: "POST", json: { action: "delete-documents", ids: chosen.map((c) => c.id) } });
      setMsg(r.message);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!candidates.length) return <p className="text-sm text-slate-500">No unused documents found for this period.</p>;

  return (
    <div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th className="th w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={picked.size === candidates.length}
                  onChange={(e) => setPicked(e.target.checked ? new Set(candidates.map((c) => c.id)) : new Set())}
                />
              </th>
              {["Document", "Why it can go", "Uploaded", "Size"].map((h) => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} className={picked.has(c.id) ? "bg-red-50/40" : ""}>
                <td className="td">
                  <input type="checkbox" aria-label={`Select ${c.title}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                </td>
                <td className="td">
                  <p className="font-semibold text-slate-900">{c.title}</p>
                  <p className="text-xs text-slate-500">{c.originalName} · {c.kind}</p>
                </td>
                <td className="td text-xs text-slate-600">{c.reasonText}</td>
                <td className="td whitespace-nowrap">{c.createdAt}</td>
                <td className="td whitespace-nowrap">{formatBytes(c.sizeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={busy || !chosen.length} className="btn btn-danger">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete selected ({chosen.length} · {formatBytes(chosenBytes)})
        </button>
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
        {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
      </div>
    </div>
  );
}
