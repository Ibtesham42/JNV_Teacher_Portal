"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";

type Created = { teacherId: string; name: string; username: string; password: string };

export default function LoginsPanel({ missing }: { missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created[] | null>(null);
  const [show, setShow] = useState(true);
  const [error, setError] = useState("");

  async function create() {
    if (!window.confirm(`Create a login for ${missing} teacher(s)? You will get a list of usernames and passwords - the passwords cannot be shown again.`)) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ created: Created[] }>("/api/teachers/logins", { method: "POST" });
      setCreated(r.created);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!created) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = ["Teacher,Username,Password", ...created.map((c) => [c.name, c.username, c.password].map(esc).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "teacher-logins.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card card-pad space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><KeyRound className="h-4 w-4 text-brand-600" /> Teacher logins</h2>
          <p className="text-xs text-slate-500">
            {missing > 0
              ? `${missing} teacher(s) do not have a login yet. Create them all at once - teachers can sign in straight away (no forced password change).`
              : "Every teacher already has a login. Use “Reset password” in the list below to issue a new one."}
          </p>
        </div>
        <button className="btn btn-primary" onClick={create} disabled={busy || missing === 0}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create logins for all teachers
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {created && (
        <div className="space-y-2">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>{created.length} login(s) created.</strong> Download or copy this list now - passwords are stored only as hashes and cannot be shown again (you can always reset one).
          </p>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={download}><Download className="h-3.5 w-3.5" /> Download CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? "Hide" : "Show"} passwords
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr>{["Teacher", "Username", "Password"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {created.map((c) => (
                  <tr key={c.teacherId}>
                    <td className="td font-medium">{c.name}</td>
                    <td className="td font-mono">{c.username}</td>
                    <td className="td font-mono">{show ? c.password : "••••••••"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
