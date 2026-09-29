"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Columns2, Loader2, RefreshCw, Save, XCircle } from "lucide-react";
import { api } from "@/lib/apiClient";
import { ClubEditor, ModEditor, RemedialEditor, TeacherMapper, WeeklyOffEditor } from "./OtherEditors";
import RoutineEditor from "./RoutineEditor";
import { groupIssues, type DraftData, type ReviewResponse, type TeacherOption, type ValidationResult } from "./types";

type Tab = "routine" | "teachers" | "mod" | "weeklyOff" | "remedial" | "clubs" | "issues" | "log";
type SaveState = "saved" | "dirty" | "saving" | "error";

const emptyDraft = (kind: DraftData["kind"]): DraftData => ({
  kind,
  session: null,
  title: "",
  periods: [],
  modDuties: [],
  weeklyOffs: [],
  remedial: [],
  clubs: [],
  teacherMap: {},
  notes: [],
  generated: null,
});

/** Today in the school's timezone, as YYYY-MM-DD. */
function schoolToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function ReviewClient({
  id,
  classes,
  sections,
  lowConfidence,
  activeVersion,
  activeRoutineId,
}: {
  id: string;
  classes: string[];
  sections: string[];
  lowConfidence: number;
  activeVersion: number | null;
  activeRoutineId: string | null;
}) {
  const [resp, setResp] = useState<ReviewResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [data, setDataState] = useState<DraftData | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [tab, setTab] = useState<Tab | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [pubError, setPubError] = useState("");
  const [published, setPublished] = useState<{ version?: number; message: string; routineId?: string } | null>(null);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [manual, setManual] = useState(false);

  const dataRef = useRef<DraftData | null>(null);
  const version = useRef(0);
  const initialised = useRef(false);

  // ------------------------------------------------------------ loading / polling
  const load = useCallback(async () => {
    const r = await api<ReviewResponse>(`/api/extraction/${id}`);
    setResp(r);
    return r;
  }, [id]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await load();
        if (stop) return;
        if (r.draft.status === "QUEUED" || r.draft.status === "PROCESSING") timer = setTimeout(tick, 1500);
      } catch (e) {
        if (!stop) setLoadError((e as Error).message);
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    api<{ teachers: TeacherOption[] }>("/api/teachers").then((r) => setTeachers(r.teachers)).catch(() => {});
  }, []);

  useEffect(() => {
    if (resp && !initialised.current && resp.data && (resp.draft.status === "REVIEW" || resp.draft.status === "PUBLISHED")) {
      initialised.current = true;
      dataRef.current = resp.data;
      setDataState(resp.data);
      setValidation(resp.validation);
    }
  }, [resp]);

  const kind: DraftData["kind"] = resp ? (["ROUTINE", "REMEDIAL", "CLUB"].includes(resp.document.kind) ? (resp.document.kind as DraftData["kind"]) : "OTHER") : "ROUTINE";

  useEffect(() => {
    if (tab || !data) return;
    setTab(data.kind === "REMEDIAL" ? "remedial" : data.kind === "CLUB" ? "clubs" : !data.periods.length && data.modDuties.length ? "mod" : "routine");
  }, [data, tab]);

  // ------------------------------------------------------------ editing + autosave
  const setData = useCallback((fn: (d: DraftData) => DraftData) => {
    if (!dataRef.current) return;
    const next = fn(dataRef.current);
    dataRef.current = next;
    version.current += 1;
    setDataState(next);
    setSaveState("dirty");
  }, []);

  const save = useCallback(async () => {
    if (!dataRef.current) return;
    const v = version.current;
    setSaveState("saving");
    setSaveError("");
    try {
      const r = await api<{ validation: ValidationResult }>(`/api/extraction/${id}`, { method: "PUT", json: { data: dataRef.current } });
      setValidation(r.validation);
      setSaveState(version.current === v ? "saved" : "dirty");
    } catch (e) {
      setSaveState("error");
      setSaveError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(save, 1400);
    return () => clearTimeout(t);
  }, [data, saveState, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  // ------------------------------------------------------------ actions
  async function publish() {
    if (!dataRef.current) return;
    setPubError("");
    if (validation && !validation.canPublish) {
      setTab("issues");
      setPubError(`Fix ${validation.errors} error(s) before publishing.`);
      return;
    }
    const replaces = dataRef.current.periods.length > 0 && activeVersion != null;
    const later = dataRef.current.periods.length > 0 && effectiveFrom && effectiveFrom > schoolToday();
    const ok = window.confirm(
      later
        ? `Schedule this routine to start on ${effectiveFrom}? Until then teachers keep seeing the current routine; it switches automatically on that day.`
        : replaces
        ? `Publish this routine? It becomes the ACTIVE routine for all teachers (replacing version ${activeVersion}, which is kept in the version history).`
        : "Publish this now? It becomes visible to all teachers.",
    );
    if (!ok) return;
    setPublishing(true);
    try {
      const r = await api<{ message: string; version?: number; routineId?: string }>(`/api/extraction/${id}/publish`, { method: "POST", json: { data: dataRef.current, ...(later ? { effectiveFrom } : {}) } });
      setPublished({ message: r.message, version: r.version, routineId: r.routineId });
      setSaveState("saved");
    } catch (e) {
      const err = e as Error & { details?: { message: string }[] };
      setPubError(err.message + (Array.isArray(err.details) ? " " + err.details.slice(0, 3).map((d) => d.message).join(" ") : ""));
      await save();
    } finally {
      setPublishing(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this extraction? The draft is discarded (the uploaded original is kept).")) return;
    setBusy(true);
    try {
      await api(`/api/extraction/${id}/cancel`, { method: "POST" });
      window.location.href = "/admin/documents";
    } catch (e) {
      setPubError((e as Error).message);
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    try {
      await api(`/api/extraction/${id}/retry`, { method: "POST" });
      window.location.reload();
    } catch (e) {
      setPubError((e as Error).message);
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ derived
  const issues = useMemo(() => groupIssues(validation), [validation]);
  const lowCount = useMemo(() => {
    if (!data) return 0;
    const under = (c: number | null) => c != null && c < lowConfidence;
    return data.periods.filter((p) => under(p.confidence)).length + data.modDuties.filter((m) => under(m.confidence)).length + data.weeklyOffs.filter((m) => under(m.confidence)).length + data.remedial.filter((m) => under(m.confidence)).length + data.clubs.filter((m) => under(m.confidence)).length;
  }, [data, lowConfidence]);

  if (loadError) return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError} <Link href="/admin/documents" className="font-semibold underline">Back to documents</Link></p>;
  if (!resp) return <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>;

  const { document: doc, draft } = resp;
  const status = draft.status;
  const inEditor = (status === "REVIEW" || (status === "FAILED" && manual)) && data && !published;
  const isImage = doc.mimeType.startsWith("image/");
  const isPdf = doc.mimeType === "application/pdf";
  const fileUrl = `/api/documents/${doc.id}/file`;
  const generated = doc.mimeType === "application/x-jnv-generated";

  const Header = (
    <div className="card card-pad mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-title">Extraction review · {data?.kind ?? doc.kind}</p>
          <h1 className="truncate text-xl font-bold text-slate-900">{doc.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {generated ? "Generated by the roster generator" : `${doc.originalName} · ${(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB`}
            {doc.pageCount ? ` · ${doc.pageCount} page(s)` : ""}
            {doc.ocrUsed ? " · scanned (OCR)" : ""}
            {draft.provider ? ` · ${draft.provider}` : ""}
            {draft.ocrConfidence != null ? ` · OCR confidence ${Math.round(draft.ocrConfidence)}%` : ""}
          </p>
        </div>
        {!generated && (
          <div className="flex gap-2">
            <a className="btn btn-secondary btn-sm" href={fileUrl} target="_blank" rel="noopener noreferrer">View original</a>
            <a className="btn btn-secondary btn-sm" href={`${fileUrl}?download=1`}>Download</a>
          </div>
        )}
      </div>
    </div>
  );

  // ---------------- published
  if (published || status === "PUBLISHED") {
    return (
      <div>
        {Header}
        <div className="card card-pad border-emerald-300 bg-emerald-50">
          <p className="flex items-center gap-2 text-lg font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> {published?.message ?? "Published."}</p>
          {published?.version && (
            <p className="mt-1 text-sm text-emerald-900">
              {published.message.startsWith("Routine scheduled") ? `Routine version ${published.version} is scheduled. Teachers keep seeing the current routine until then.` : `Routine version ${published.version} is now ACTIVE. Teachers see it immediately.`}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className="btn btn-primary">Open the website</Link>
            <Link href="/routine/class" className="btn btn-secondary">View routine</Link>
            <Link href="/admin/mod" className="btn btn-secondary">Manage MOD</Link>
            <Link href="/admin/weekly-off" className="btn btn-secondary">Manage weekly off</Link>
            {published?.routineId && activeRoutineId && activeRoutineId !== published.routineId && (
              <Link href={`/admin/routines/diff?from=${activeRoutineId}&to=${published.routineId}`} className="btn btn-secondary">
                What changed since v{activeVersion}?
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- cancelled
  if (status === "CANCELLED") {
    return (
      <div>
        {Header}
        <p className="card card-pad text-sm text-slate-600">This extraction was cancelled. <Link className="font-semibold text-brand-700 underline" href="/admin/upload">Upload again</Link> or <button className="font-semibold text-brand-700 underline" onClick={retry} disabled={busy}>re-run extraction</button>.</p>
      </div>
    );
  }

  // ---------------- processing
  if (status === "QUEUED" || status === "PROCESSING") {
    const steps = [
      { label: "Document uploaded successfully.", done: true },
      { label: "Extracting timetable...", done: false, active: true },
      { label: "Extraction completed.", done: false },
    ];
    return (
      <div>
        {Header}
        <div className="card card-pad space-y-4">
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.label} className={clsx("flex items-center gap-2 text-sm font-semibold", s.done ? "text-emerald-700" : s.active ? "text-slate-900" : "text-slate-400")}>
                {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.active ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : <span className="h-4 w-4 rounded-full border border-slate-300" />}
                {s.label}
              </li>
            ))}
          </ol>
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{draft.stage}</span>
              <span>{draft.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${Math.max(4, draft.progress)}%` }} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Scanned documents are read with OCR, which can take a minute or two. You can leave this page - the draft will wait in <Link className="underline" href="/admin/documents">Documents</Link>.</p>
          <LogList logs={resp.logs} />
        </div>
      </div>
    );
  }

  // ---------------- failed (no manual mode)
  if (status === "FAILED" && !manual) {
    return (
      <div>
        {Header}
        <div className="card card-pad space-y-4 border-red-200">
          <p className="flex items-center gap-2 font-bold text-red-700"><XCircle className="h-5 w-5" /> Extraction failed</p>
          <p className="text-sm text-slate-700">{draft.errorMessage ?? "The document could not be processed."}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={retry} disabled={busy}><RefreshCw className="h-4 w-4" /> Retry extraction</button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const d = emptyDraft(kind);
                d.title = doc.title;
                dataRef.current = d;
                initialised.current = true;
                setDataState(d);
                setManual(true);
                setTab(kind === "REMEDIAL" ? "remedial" : kind === "CLUB" ? "clubs" : "routine");
                setSaveState("dirty");
              }}
            >
              Enter the data manually
            </button>
            <button className="btn btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>
          </div>
          <LogList logs={resp.logs} />
        </div>
      </div>
    );
  }

  if (!inEditor || !data) return <p className="text-slate-500">Preparing review...</p>;

  // ---------------- editor
  const counts = {
    routine: data.periods.length,
    mod: data.modDuties.length,
    weeklyOff: data.weeklyOffs.length,
    remedial: data.remedial.length,
    clubs: data.clubs.length,
  };
  const tabs: { key: Tab; label: string; count?: number; badge?: number }[] = [
    { key: "routine", label: "Routine", count: counts.routine },
    { key: "teachers", label: "Teachers", count: Object.keys(validation?.resolved ?? {}).length, badge: validation?.unresolvedTeachers.length },
    { key: "mod", label: "MOD / Duty", count: counts.mod },
    { key: "weeklyOff", label: "Weekly off", count: counts.weeklyOff },
    { key: "remedial", label: "Remedial", count: counts.remedial },
    { key: "clubs", label: "Clubs", count: counts.clubs },
    { key: "issues", label: "Issues", count: validation?.issues.length, badge: validation?.errors },
    { key: "log", label: "Log" },
  ];
  const publishLabel = data.kind === "REMEDIAL" ? "PUBLISH SCHEDULE" : data.kind === "CLUB" ? "PUBLISH CLUBS" : !data.periods.length && data.modDuties.length ? "PUBLISH DUTY ROSTER" : "PUBLISH ROUTINE";
  const canPublish = !!validation?.canPublish && saveState !== "saving";

  const editor = (
    <div>
      {/* action bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className={clsx("font-semibold", saveState === "error" ? "text-red-600" : saveState === "saved" ? "text-emerald-700" : "text-slate-500")}>
              {saveState === "saved" ? "All changes saved" : saveState === "saving" ? "Saving..." : saveState === "dirty" ? "Unsaved changes" : "Save failed"}
            </span>
            {validation && (
              <>
                <span className={clsx("badge", validation.errors ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800")}>{validation.errors} error(s)</span>
                <span className={clsx("badge", validation.warnings ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>{validation.warnings} warning(s)</span>
              </>
            )}
            {lowCount > 0 && <span className="badge bg-amber-100 text-amber-800">{lowCount} low confidence</span>}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {!generated && (
              <button className="btn btn-secondary btn-sm hidden xl:inline-flex" onClick={() => setCompare((c) => !c)}>
                <Columns2 className="h-4 w-4" /> {compare ? "Hide original" : "Compare with original"}
              </button>
            )}
            <button className="btn btn-secondary" onClick={save} disabled={saveState === "saving"}><Save className="h-4 w-4" /> SAVE DRAFT</button>
            {data.periods.length > 0 && (
              <label className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700" title="Leave as today to publish now, or pick a future date to schedule it">
                Effective from
                <input
                  type="date"
                  value={effectiveFrom || schoolToday()}
                  min={schoolToday()}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-normal"
                />
              </label>
            )}
            <button className="btn btn-success" onClick={publish} disabled={publishing || !canPublish} title={canPublish ? "" : "Fix the errors first"}>
              {publishing && <Loader2 className="h-4 w-4 animate-spin" />} {data.periods.length > 0 && effectiveFrom && effectiveFrom > schoolToday() ? "SCHEDULE ROUTINE" : publishLabel}
            </button>
            <button className="btn btn-secondary" onClick={cancel} disabled={busy || publishing}>CANCEL</button>
          </div>
        </div>
        {(pubError || saveError) && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{pubError || saveError}</p>}
      </div>

      <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-900">
        <strong>Extraction completed.</strong> Check the data against the original document, correct anything wrong, then press <strong>{publishLabel}</strong>. Nothing is visible to teachers until you publish.
        {data.notes.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-semibold">{data.notes.length} note(s) from the extractor</summary>
            <ul className="mt-1 list-inside list-disc text-xs">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </details>
        )}
      </div>

      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx("whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold", tab === t.key ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100")}
          >
            {t.label}
            {t.count != null && <span className={clsx("ml-1.5 text-xs", tab === t.key ? "text-brand-100" : "text-slate-400")}>{t.count}</span>}
            {!!t.badge && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{t.badge}</span>}
          </button>
        ))}
      </div>

      <datalist id="teacher-options">{teachers.map((t) => <option key={t.id} value={t.name} />)}</datalist>

      {tab === "routine" && <RoutineEditor data={data} setData={setData} issues={issues} classes={classes} sections={sections} lowConfidence={lowConfidence} />}
      {tab === "teachers" && <TeacherMapper data={data} setData={setData} validation={validation} teachers={teachers} />}
      {tab === "mod" && <ModEditor data={data} setData={setData} issues={issues} low={lowConfidence} />}
      {tab === "weeklyOff" && <WeeklyOffEditor data={data} setData={setData} issues={issues} low={lowConfidence} />}
      {tab === "remedial" && <RemedialEditor data={data} setData={setData} issues={issues} classes={classes} sections={sections} low={lowConfidence} />}
      {tab === "clubs" && <ClubEditor data={data} setData={setData} issues={issues} low={lowConfidence} />}
      {tab === "issues" && (
        <div className="space-y-2">
          {validation?.issues.length ? (
            <ul className="card divide-y divide-slate-100">
              {[...validation.issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1)).map((i, n) => (
                <li key={n} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                  {i.severity === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> No issues found.</p>
          )}
        </div>
      )}
      {tab === "log" && <LogList logs={resp.logs} />}
    </div>
  );

  return (
    <div>
      {Header}
      {compare ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="min-w-0">{editor}</div>
          <div className="hidden xl:block">
            <div className="sticky top-16 h-[calc(100vh-6rem)] overflow-auto rounded-xl border border-slate-200 bg-white">
              {isPdf ? (
                <iframe src={`${fileUrl}#toolbar=0`} className="h-full w-full" title="Original document" />
              ) : isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl} alt="Original document" className="w-full" />
              ) : (
                <p className="p-4 text-sm text-slate-600">Word documents cannot be previewed here. <a className="font-semibold text-brand-700 underline" href={`${fileUrl}?download=1`}>Download the original</a>.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        editor
      )}
    </div>
  );
}

function LogList({ logs }: { logs: ReviewResponse["logs"] }) {
  if (!logs.length) return null;
  return (
    <div className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
      {logs.map((l) => (
        <div key={l.id} className={l.level === "ERROR" ? "text-red-300" : l.level === "WARN" ? "text-amber-300" : ""}>
          <span className="text-slate-500">{new Date(l.createdAt).toLocaleTimeString()}</span> [{l.stage}] {l.message}
        </div>
      ))}
    </div>
  );
}
