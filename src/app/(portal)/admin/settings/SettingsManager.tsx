"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, Plus, X } from "lucide-react";
import { api } from "@/lib/apiClient";

type Settings = {
  schoolName: string;
  schoolAddress: string;
  portalName: string;
  examSheetUrl: string;
  classes: string[];
  sections: string[];
  contactPhone: string | null;
  contactEmail: string | null;
  footerText: string | null;
};

function ChipList({ label, hint, values, onChange }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim().toUpperCase();
    if (!v || values.includes(v)) return setDraft("");
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div>
      <label className="label">{label}</label>
      <p className="mb-2 text-xs text-slate-500">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800 ring-1 ring-brand-100">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-brand-400 hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <input
            className="input !w-24 !py-1 text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="Add..."
            maxLength={10}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={add}><Plus className="h-3 w-3" /></button>
        </span>
      </div>
    </div>
  );
}

export default function SettingsManager({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { settings: saved } = await api<{ settings: Settings }>("/api/admin/settings", { method: "PATCH", json: form });
      setForm(saved);
      setMsg({ ok: true, text: "Saved. The site now reflects these changes." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card card-pad max-w-2xl space-y-5">
      {msg && (
        <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{msg.text}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-name">School name</label>
          <input id="s-name" className="input" value={form.schoolName} maxLength={160} minLength={2} required onChange={(e) => set("schoolName", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-addr">School address</label>
          <input id="s-addr" className="input" value={form.schoolAddress} maxLength={200} minLength={2} required onChange={(e) => set("schoolAddress", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-portal">Portal title</label>
          <input id="s-portal" className="input" value={form.portalName} maxLength={80} minLength={2} required onChange={(e) => set("portalName", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-exam">Exam sheet URL</label>
          <input id="s-exam" type="url" className="input" value={form.examSheetUrl} maxLength={500} required onChange={(e) => set("examSheetUrl", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-phone">Contact phone</label>
          <input id="s-phone" className="input" value={form.contactPhone ?? ""} maxLength={30} onChange={(e) => set("contactPhone", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-email">Contact email</label>
          <input id="s-email" type="email" className="input" value={form.contactEmail ?? ""} maxLength={120} onChange={(e) => set("contactEmail", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-footer">Footer text</label>
          <input id="s-footer" className="input" value={form.footerText ?? ""} maxLength={300} onChange={(e) => set("footerText", e.target.value)} />
        </div>
      </div>

      <ChipList
        label="Classes"
        hint="Classes the school runs. Used to validate uploaded routines and populate class pickers."
        values={form.classes}
        onChange={(v) => set("classes", v)}
      />
      <ChipList
        label="Sections"
        hint="Section letters used across classes."
        values={form.sections}
        onChange={(v) => set("sections", v)}
      />

      <button className="btn btn-primary" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
      </button>
    </form>
  );
}
