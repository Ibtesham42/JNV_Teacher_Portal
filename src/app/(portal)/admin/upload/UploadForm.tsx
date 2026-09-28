"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";

const KINDS = [
  { value: "ROUTINE", label: "Class routine / timetable", extract: true, hint: "Timetable, and any MOD or weekly-off table printed in it, is extracted for review." },
  { value: "REMEDIAL", label: "Remedial / Life skill / Enrichment schedule", extract: true, hint: "Class, day, time, activity and teacher are extracted for review." },
  { value: "CLUB", label: "Club activities", extract: true, hint: "Club names, teacher members and suggested activities are extracted for review." },
  { value: "OTHER", label: "Other official document", extract: false, hint: "Stored and shown under Official Documents. No extraction." },
] as const;

const MAX_MB = 25;

export default function UploadForm({ initialKind, aiEnabled, groqEnabled }: { initialKind?: string; aiEnabled: boolean; groqEnabled: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>(KINDS.some((k) => k.value === initialKind) ? initialKind! : "ROUTINE");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = KINDS.find((k) => k.value === kind)!;

  function pick(f: File | undefined | null) {
    setError("");
    if (!f) return;
    if (!/\.(pdf|jpe?g|png|docx?)$/i.test(f.name)) return setError("Unsupported file type. Upload PDF, JPG, PNG, DOC or DOCX.");
    if (f.size > MAX_MB * 1024 * 1024) return setError(`File is too large (max ${MAX_MB} MB).`);
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a file first.");
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    if (title.trim()) fd.set("title", title.trim());
    try {
      const res = await fetch("/api/documents", { method: "POST", body: fd, credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Upload failed.");
      setDone(true);
      if (current.extract) router.push(`/admin/review/${body.document.id}`);
      else router.push("/admin/documents");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-pad space-y-5">
      <div>
        <label className="label" htmlFor="kind">Document type</label>
        <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">{current.hint}</p>
      </div>

      <div>
        <label className="label" htmlFor="title">Title (optional)</label>
        <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Class routine 2025-26 (revised)" disabled={busy} />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-400"}`}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      >
        <FileUp className="h-8 w-8 text-brand-600" />
        {file ? (
          <p className="text-sm font-semibold text-slate-900">{file.name} <span className="font-normal text-slate-500">({(file.size / 1024 / 1024).toFixed(2)} MB)</span></p>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-800">Tap to choose a file, or drop it here</p>
            <p className="text-xs text-slate-500">PDF, JPG, PNG, DOC, DOCX · up to {MAX_MB} MB</p>
          </>
        )}
        <input ref={input} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      {current.extract && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900">
          After uploading, the document is read automatically ({aiEnabled ? "OCR + AI extraction" : groqEnabled ? "OCR + rule-based reader + AI clean-up" : "OCR + rule-based extraction"}). Nothing is visible to teachers until you review and press <strong>Publish</strong>.
        </p>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Document uploaded successfully.
        </p>
      )}

      <button className="btn btn-primary w-full sm:w-auto" disabled={busy || !file}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}
