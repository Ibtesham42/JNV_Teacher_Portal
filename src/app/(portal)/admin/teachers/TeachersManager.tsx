"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { KeyRound, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { api } from "@/lib/apiClient";
import PasswordField from "@/components/PasswordField";

type T = { id: string; name: string; code: string | null; designation: string | null; phone: string | null; aliases: string[]; active: boolean; username: string | null };

export default function TeachersManager({ teachers }: { teachers: T[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () =>
      teachers.filter(
        (t) => (showInactive || t.active) && (!q.trim() || `${t.name} ${t.code ?? ""} ${t.designation ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [teachers, q, showInactive],
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

  async function addOne(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await run(
      () =>
        api("/api/teachers", {
          method: "POST",
          json: {
            name: f.get("name"),
            code: f.get("code") || null,
            designation: f.get("designation") || null,
            phone: f.get("phone") || null,
            aliases: String(f.get("aliases") || "").split(",").map((s) => s.trim()).filter(Boolean),
          },
        }).then(() => form.reset()),
      "Teacher added.",
    );
  }

  /** "Name", "Name, TGT-SCI", "Name, TGT-SCI, Designation" or "TGT-SCI = Name" (comma / tab / | separated). */
  function parseBulk(text: string) {
    const isCode = (v: string) => /^(TGT|PGT|PRT|PET|PPL|PAT|HM|VP|LIB|CT)\b/i.test(v.trim());
    const rows: { name: string; code: string | null; designation: string | null }[] = [];
    for (const line of text.split("\n")) {
      const eq = line.split("=");
      const parts = (eq.length === 2 ? eq : line.split(/\t|\||,/)).map((p) => p.trim()).filter(Boolean);
      if (!parts.length) continue;
      let [name, code, designation] = [parts[0], parts[1] ?? null, parts[2] ?? null] as (string | null)[];
      if (name && isCode(name) && code && !isCode(code)) [name, code] = [code, name];
      if (name && name.length >= 2) rows.push({ name, code: code || null, designation: designation || null });
    }
    return rows;
  }

  async function addBulk() {
    const rows = parseBulk(bulk);
    if (!rows.length) return;
    await run(async () => {
      for (const r of rows) await api("/api/teachers", { method: "POST", json: r });
      setBulk("");
    }, `${rows.length} teacher(s) added.`);
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{msg.text}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={addOne} className="card card-pad space-y-3">
          <h2 className="font-bold text-slate-900">Add a teacher</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="t-name">Name (as printed in the routine)</label><input id="t-name" name="name" className="input" required minLength={2} maxLength={120} /></div>
            <div><label className="label" htmlFor="t-code">Code (e.g. TGT-SCI)</label><input id="t-code" name="code" className="input" maxLength={40} /></div>
            <div><label className="label" htmlFor="t-des">Designation</label><input id="t-des" name="designation" className="input" maxLength={80} /></div>
            <div><label className="label" htmlFor="t-phone">Phone</label><input id="t-phone" name="phone" className="input" maxLength={30} /></div>
            <div><label className="label" htmlFor="t-alias">Other spellings (comma separated)</label><input id="t-alias" name="aliases" className="input" /></div>
          </div>
          <button className="btn btn-primary" disabled={busy}><Plus className="h-4 w-4" /> Add teacher</button>
        </form>

        <div className="card card-pad space-y-3">
          <h2 className="font-bold text-slate-900">Add many teachers</h2>
          <p className="text-xs text-slate-500">Paste names, one per line, exactly as they appear in the routine. You can add codes and designations afterwards.</p>
          <textarea className="input min-h-[120px]" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Name one\nName two"} />
          <button className="btn btn-secondary" onClick={addBulk} disabled={busy || !bulk.trim()}>Add all</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Filter teachers..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        <span className="text-xs text-slate-500">{list.length} shown</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr>{["Name", "Code", "Designation", "Login", "Status", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className={t.active ? "" : "opacity-60"}>
                {editing === t.id ? (
                  <td colSpan={6} className="td">
                    <EditRow t={t} onDone={() => setEditing(null)} run={run} busy={busy} />
                  </td>
                ) : loginFor === t.id ? (
                  <td colSpan={6} className="td">
                    <LoginRow t={t} onDone={() => setLoginFor(null)} run={run} busy={busy} />
                  </td>
                ) : (
                  <>
                    <td className="td font-semibold text-slate-900">{t.name}{t.aliases.length > 0 && <span className="block text-xs font-normal text-slate-500">also: {t.aliases.join(", ")}</span>}</td>
                    <td className="td">{t.code ?? "—"}</td>
                    <td className="td">{t.designation ?? "—"}</td>
                    <td className="td text-xs">{t.username ? <span className="font-semibold text-emerald-700">{t.username}</span> : <span className="text-slate-400">no login</span>}</td>
                    <td className="td">{t.active ? <span className="badge bg-emerald-100 text-emerald-800">Active</span> : <span className="badge bg-slate-100 text-slate-600">Inactive</span>}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(t.id)}><Pencil className="h-3 w-3" /> Edit</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setLoginFor(t.id)}><KeyRound className="h-3 w-3" /> {t.username ? "Reset password" : "Create login"}</button>
                        {t.active ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => window.confirm(`Deactivate ${t.name}? Their login is disabled; old routines keep their name.`) && run(() => api(`/api/teachers/${t.id}`, { method: "DELETE" }), "Teacher deactivated.")}><UserX className="h-3 w-3" /> Deactivate</button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => run(() => api(`/api/teachers/${t.id}`, { method: "PATCH", json: { active: true } }), "Teacher activated.")}><UserCheck className="h-3 w-3" /> Activate</button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!list.length && (
              <tr><td colSpan={6} className="td text-slate-500">No teachers yet. Add them above, or publish a routine and create the teachers found in it.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RunFn = (fn: () => Promise<unknown>, okText: string) => Promise<void>;

function EditRow({ t, onDone, run, busy }: { t: T; onDone: () => void; run: RunFn; busy: boolean }) {
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      () =>
        api(`/api/teachers/${t.id}`, {
          method: "PATCH",
          json: {
            name: f.get("name"),
            code: f.get("code") || null,
            designation: f.get("designation") || null,
            phone: f.get("phone") || null,
            aliases: String(f.get("aliases") || "").split(",").map((s) => s.trim()).filter(Boolean),
          },
        }).then(onDone),
      "Teacher updated.",
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-6">
      <input name="name" defaultValue={t.name} className="input sm:col-span-2" required minLength={2} aria-label="Name" />
      <input name="code" defaultValue={t.code ?? ""} className="input" placeholder="Code" aria-label="Code" />
      <input name="designation" defaultValue={t.designation ?? ""} className="input" placeholder="Designation" aria-label="Designation" />
      <input name="phone" defaultValue={t.phone ?? ""} className="input" placeholder="Phone" aria-label="Phone" />
      <input name="aliases" defaultValue={t.aliases.join(", ")} className="input sm:col-span-4" placeholder="Other spellings (comma separated)" aria-label="Aliases" />
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary btn-sm" disabled={busy}>Save</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function LoginRow({ t, onDone, run, busy }: { t: T; onDone: () => void; run: RunFn; busy: boolean }) {
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      () => api(`/api/teachers/${t.id}/account`, { method: "POST", json: { username: f.get("username"), password: f.get("password"), mustChangePassword: f.get("must") === "on" } }).then(onDone),
      t.username ? "Password reset." : "Login created.",
    );
  }
  return (
    <form onSubmit={submit} className="grid items-end gap-2 sm:grid-cols-5">
      <div><label className="label">Username</label><input name="username" defaultValue={t.username ?? t.name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")} className="input" required minLength={3} /></div>
      <div><label className="label">{t.username ? "New password" : "Password"}</label><PasswordField name="password" showByDefault required minLength={8} autoComplete="off" /></div>
      <label className="flex items-center gap-2 pb-2 text-sm text-slate-600"><input type="checkbox" name="must" /> Force a password change at first sign-in</label>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary btn-sm" disabled={busy}>{t.username ? "Reset password" : "Create login"}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
