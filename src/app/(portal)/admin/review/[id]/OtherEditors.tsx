"use client";

import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { dayLabel, newId, WEEKDAYS, type WeekdayName } from "@/lib/common";
import type { DraftData, ItemIssues, TeacherOption, ValidationResult } from "./types";

type SetData = (fn: (d: DraftData) => DraftData) => void;

const cellCls = (its: { severity: string; message: string }[] | undefined, low: boolean) =>
  clsx(its?.some((i) => i.severity === "error") ? "bg-red-50" : its?.length || low ? "bg-amber-50" : "");
const msg = (its: { message: string }[] | undefined) => its?.map((i) => i.message).join("\n");
const pct = (c: number | null) => (c == null ? "—" : `${Math.round(c * 100)}%`);

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={onClick}>
      <Plus className="h-3 w-3" /> {label}
    </button>
  );
}

function Del({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-slate-400 hover:text-red-600" aria-label="Delete row">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function ModEditor({ data, setData, issues, low }: { data: DraftData; setData: SetData; issues: ItemIssues; low: number }) {
  const patch = (id: string, p: Partial<DraftData["modDuties"][number]>) =>
    setData((d) => ({ ...d, modDuties: d.modDuties.map((m) => (m.id === id ? { ...m, ...p, confidence: null } : m)) }));
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        MOD and Sunday / holiday duty entries found in the document. Only entries with a printed date and a named person are imported - a date with no name is never filled in. You can also manage duty later from <strong>Admin → MOD</strong>.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr>{["Type", "Date", "Teacher", "Printed code / designation", "House", "Classes", "Details", "Conf.", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.modDuties.map((m) => (
              <tr key={m.id} className={cellCls(issues.get(m.id), m.confidence != null && m.confidence < low)} title={msg(issues.get(m.id))}>
                <td className="td">
                  <select className="input !py-1" value={m.dutyType} onChange={(e) => patch(m.id, { dutyType: e.target.value as "MOD" | "HOLIDAY" })}>
                    <option value="MOD">MOD</option>
                    <option value="HOLIDAY">Holiday duty</option>
                  </select>
                </td>
                <td className="td"><input type="date" className="input !py-1" value={m.date} onChange={(e) => patch(m.id, { date: e.target.value })} /></td>
                <td className="td"><input className="input !py-1" list="teacher-options" value={m.teacherName} onChange={(e) => patch(m.id, { teacherName: e.target.value })} /></td>
                <td className="td"><input className="input !py-1" value={m.designation ?? ""} onChange={(e) => patch(m.id, { designation: e.target.value || null })} /></td>
                <td className="td"><input className="input !py-1" value={m.house ?? ""} onChange={(e) => patch(m.id, { house: e.target.value || null })} /></td>
                <td className="td"><input className="input !py-1" value={m.classes ?? ""} onChange={(e) => patch(m.id, { classes: e.target.value || null })} /></td>
                <td className="td"><input className="input !py-1" value={m.description} onChange={(e) => patch(m.id, { description: e.target.value })} /></td>
                <td className="td text-xs text-slate-500">{pct(m.confidence)}</td>
                <td className="td"><Del onClick={() => setData((d) => ({ ...d, modDuties: d.modDuties.filter((x) => x.id !== m.id) }))} /></td>
              </tr>
            ))}
            {!data.modDuties.length && <tr><td colSpan={9} className="td text-slate-500">No MOD or duty information found in this document.</td></tr>}
          </tbody>
        </table>
      </div>
      <AddButton
        label="Add entry"
        onClick={() => setData((d) => ({ ...d, modDuties: [...d.modDuties, { id: newId("m"), date: new Date().toISOString().slice(0, 10), teacherName: "", description: "", dutyType: "MOD" as const, designation: null, house: null, classes: null, offDate: null, confidence: null }] }))}
      />
    </div>
  );
}

export function WeeklyOffEditor({ data, setData, issues, low }: { data: DraftData; setData: SetData; issues: ItemIssues; low: number }) {
  const patch = (id: string, p: Partial<DraftData["weeklyOffs"][number]>) =>
    setData((d) => ({ ...d, weeklyOffs: d.weeklyOffs.map((m) => (m.id === id ? { ...m, ...p, confidence: null } : m)) }));
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Weekly-off entries found in the document. If the document has none, enter them here or later from <strong>Admin → Weekly off</strong>. Publishing replaces the weekly off of every teacher listed here.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr>{["Teacher", "Weekly off day", "Confidence", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.weeklyOffs.map((w) => (
              <tr key={w.id} className={cellCls(issues.get(w.id), w.confidence != null && w.confidence < low)} title={msg(issues.get(w.id))}>
                <td className="td"><input className="input !py-1" list="teacher-options" value={w.teacherName} onChange={(e) => patch(w.id, { teacherName: e.target.value })} /></td>
                <td className="td">
                  <select className="input !py-1" value={w.day} onChange={(e) => patch(w.id, { day: e.target.value as WeekdayName })}>
                    {WEEKDAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                  </select>
                </td>
                <td className="td text-xs text-slate-500">{pct(w.confidence)}</td>
                <td className="td"><Del onClick={() => setData((d) => ({ ...d, weeklyOffs: d.weeklyOffs.filter((x) => x.id !== w.id) }))} /></td>
              </tr>
            ))}
            {!data.weeklyOffs.length && <tr><td colSpan={4} className="td text-slate-500">Information not available in uploaded document.</td></tr>}
          </tbody>
        </table>
      </div>
      <AddButton label="Add weekly off" onClick={() => setData((d) => ({ ...d, weeklyOffs: [...d.weeklyOffs, { id: newId("w"), day: "SUNDAY", teacherName: "", confidence: null }] }))} />
    </div>
  );
}

export function RemedialEditor({ data, setData, issues, classes, sections, low }: { data: DraftData; setData: SetData; issues: ItemIssues; classes: string[]; sections: string[]; low: number }) {
  const patch = (id: string, p: Partial<DraftData["remedial"][number]>) =>
    setData((d) => ({ ...d, remedial: d.remedial.map((m) => (m.id === id ? { ...m, ...p, confidence: null } : m)) }));
  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr>{["Type", "Class", "Section", "Day", "Start", "End", "Activity", "Teacher", "Conf.", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.remedial.map((r) => (
              <tr key={r.id} className={cellCls(issues.get(r.id), r.confidence != null && r.confidence < low)} title={msg(issues.get(r.id))}>
                <td className="td">
                  <select className="input !py-1" value={r.category} onChange={(e) => patch(r.id, { category: e.target.value as any })}>
                    <option value="REMEDIAL">Remedial</option>
                    <option value="LIFE_SKILL">Life skill</option>
                    <option value="ENRICHMENT">Enrichment</option>
                    <option value="OTHER">Other</option>
                  </select>
                </td>
                <td className="td">
                  <select className="input !py-1" value={r.className} onChange={(e) => patch(r.id, { className: e.target.value })}>
                    {!classes.includes(r.className) && <option value={r.className}>{r.className || "?"}</option>}
                    {classes.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td className="td">
                  <select className="input !py-1" value={r.section} onChange={(e) => patch(r.id, { section: e.target.value })}>
                    <option value="">—</option>
                    {sections.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="td">
                  <select className="input !py-1" value={r.day ?? ""} onChange={(e) => patch(r.id, { day: (e.target.value || null) as WeekdayName | null })}>
                    <option value="">—</option>
                    {WEEKDAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                  </select>
                </td>
                <td className="td"><input type="time" className="input !py-1" value={r.startTime ?? ""} onChange={(e) => patch(r.id, { startTime: e.target.value || null })} /></td>
                <td className="td"><input type="time" className="input !py-1" value={r.endTime ?? ""} onChange={(e) => patch(r.id, { endTime: e.target.value || null })} /></td>
                <td className="td"><input className="input !py-1" value={r.activity} onChange={(e) => patch(r.id, { activity: e.target.value })} /></td>
                <td className="td"><input className="input !py-1" list="teacher-options" value={r.teacherName} onChange={(e) => patch(r.id, { teacherName: e.target.value })} /></td>
                <td className="td text-xs text-slate-500">{pct(r.confidence)}</td>
                <td className="td"><Del onClick={() => setData((d) => ({ ...d, remedial: d.remedial.filter((x) => x.id !== r.id) }))} /></td>
              </tr>
            ))}
            {!data.remedial.length && <tr><td colSpan={10} className="td text-slate-500">Information not available in uploaded document.</td></tr>}
          </tbody>
        </table>
      </div>
      <AddButton
        label="Add row"
        onClick={() => setData((d) => ({ ...d, remedial: [...d.remedial, { id: newId("r"), category: "REMEDIAL", className: classes[0] ?? "", section: "", day: null, startTime: null, endTime: null, activity: "", teacherName: "", confidence: null }] }))}
      />
    </div>
  );
}

export function ClubEditor({ data, setData, issues, low }: { data: DraftData; setData: SetData; issues: ItemIssues; low: number }) {
  const patch = (id: string, p: Partial<DraftData["clubs"][number]>) =>
    setData((d) => ({ ...d, clubs: d.clubs.map((m) => (m.id === id ? { ...m, ...p, confidence: null } : m)) }));
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        {data.clubs.map((c) => (
          <div key={c.id} className={clsx("card card-pad space-y-3", cellCls(issues.get(c.id), c.confidence != null && c.confidence < low))} title={msg(issues.get(c.id))}>
            <div className="flex items-center gap-2">
              <input className="input font-bold" value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} aria-label="Club name" />
              <span className="text-xs text-slate-500">{pct(c.confidence)}</span>
              <Del onClick={() => setData((d) => ({ ...d, clubs: d.clubs.filter((x) => x.id !== c.id) }))} />
            </div>
            <div>
              <label className="label">Teacher members (one per line)</label>
              <textarea className="input min-h-[80px]" defaultValue={c.teachers.join("\n")} onBlur={(e) => patch(c.id, { teachers: lines(e.target.value) })} />
            </div>
            <div>
              <label className="label">Suggested activities (one per line)</label>
              <textarea className="input min-h-[100px]" defaultValue={c.activities.join("\n")} onBlur={(e) => patch(c.id, { activities: lines(e.target.value) })} />
            </div>
          </div>
        ))}
      </div>
      {!data.clubs.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">Information not available in uploaded document.</p>}
      <AddButton label="Add club" onClick={() => setData((d) => ({ ...d, clubs: [...d.clubs, { id: newId("c"), name: "New club", teachers: [], activities: [], confidence: null }] }))} />
    </div>
  );
}

/** Match teacher names read from the document to the teacher list (or create them). Nothing is guessed. */
export function TeacherMapper({
  data,
  setData,
  validation,
  teachers,
}: {
  data: DraftData;
  setData: SetData;
  validation: ValidationResult | null;
  teachers: TeacherOption[];
}) {
  const resolved = validation?.resolved ?? {};
  const unresolved = new Set(validation?.unresolvedTeachers ?? []);
  const suggestions = validation?.suggestions ?? {};
  const byId = new Map(teachers.map((t) => [t.id, t]));

  const uses = new Map<string, number>();
  for (const p of data.periods) if (!p.isBreak && p.teacherName.trim()) uses.set(p.teacherName.trim(), (uses.get(p.teacherName.trim()) ?? 0) + 1);
  for (const m of data.modDuties) uses.set(m.teacherName.trim(), (uses.get(m.teacherName.trim()) ?? 0) + 1);
  for (const w of data.weeklyOffs) uses.set(w.teacherName.trim(), (uses.get(w.teacherName.trim()) ?? 0) + 1);
  for (const r of data.remedial) if (r.teacherName.trim()) uses.set(r.teacherName.trim(), (uses.get(r.teacherName.trim()) ?? 0) + 1);

  const names = Object.keys(resolved).sort((a, b) => {
    const ua = unresolved.has(a) ? 0 : 1;
    const ub = unresolved.has(b) ? 0 : 1;
    return ua - ub || (uses.get(b) ?? 0) - (uses.get(a) ?? 0) || a.localeCompare(b);
  });
  const others = [...names].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0)).slice(0, 60);
  const applicable = [...unresolved].filter((n) => suggestions[n]);
  const remaining = [...unresolved].filter((n) => !suggestions[n]);
  // one-off names are usually OCR misreadings: only offer bulk-creating names that are used repeatedly
  const frequent = remaining.filter((n) => (uses.get(n) ?? 0) >= 3);
  const rare = remaining.length - frequent.length;

  const rename = (pairs: [string, string][]) =>
    setData((d) => {
      const map = new Map(pairs);
      const fix = <T extends { teacherName: string; confidence: number | null }>(x: T): T => {
        const to = map.get(x.teacherName.trim());
        return to ? { ...x, teacherName: to, confidence: null } : x;
      };
      return { ...d, periods: d.periods.map(fix), modDuties: d.modDuties.map(fix), weeklyOffs: d.weeklyOffs.map(fix), remedial: d.remedial.map(fix) };
    });
  const setMap = (raw: string, value: string) =>
    setData((d) => {
      const teacherMap = { ...d.teacherMap };
      if (value) teacherMap[raw] = value;
      else delete teacherMap[raw];
      return { ...d, teacherMap };
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Names exactly as printed in the document, with how often each is used. Each must match a teacher in the teacher list. <strong>Nothing is guessed:</strong> pick the right teacher, mark it as the same person as another name, or create it. A choice you make is remembered as an alias for future uploads.
      </p>
      {unresolved.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <span className="font-semibold">{unresolved.size} name(s) need a decision.</span>
          <span className="text-xs">Names used only once or twice are often OCR misreadings - fix or merge those first.</span>
          {applicable.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => rename(applicable.map((n) => [n, suggestions[n]]))}>
              Apply {applicable.length} spelling suggestion(s)
            </button>
          )}
          {frequent.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => window.confirm(`Create ${frequent.length} new teacher(s) from the names used 3 or more times, exactly as printed?`) && setData((d) => {
                const m = { ...d.teacherMap };
                frequent.forEach((n) => (m[n] = "NEW"));
                return { ...d, teacherMap: m };
              })}
            >
              Create {frequent.length} frequently used name(s) as new teachers
            </button>
          )}
          {rare > 0 && <span className="text-xs">{rare} rarely used name(s) are left for you to decide (likely misreadings).</span>}
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>{["Name in document", "Used", "Status", "Decision"].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {names.map((raw) => {
              const id = resolved[raw];
              const mapped = data.teacherMap[raw];
              const isNew = mapped === "NEW";
              const isSame = !!mapped?.startsWith("SAME:");
              const pending = unresolved.has(raw);
              return (
                <tr key={raw} className={pending ? "bg-red-50" : ""}>
                  <td className="td font-medium">
                    {raw}
                    {suggestions[raw] && pending && (
                      <button
                        type="button"
                        className="mt-1 block rounded-md bg-amber-100 px-2 py-1 text-left text-xs font-semibold text-amber-900 hover:bg-amber-200"
                        onClick={() => rename([[raw, suggestions[raw]]])}
                        title="Replace every occurrence in this draft"
                      >
                        Probably a misreading of “{suggestions[raw]}” — use that
                      </button>
                    )}
                  </td>
                  <td className="td text-xs text-slate-500">{uses.get(raw) ?? 0}×</td>
                  <td className="td text-xs">
                    {id ? (
                      <span className="font-semibold text-emerald-700">Matched → {byId.get(id)?.name ?? "teacher"}</span>
                    ) : isNew ? (
                      <span className="font-semibold text-brand-700">Will be created</span>
                    ) : isSame ? (
                      <span className="font-semibold text-brand-700">Same as “{mapped!.slice(5)}”</span>
                    ) : (
                      <span className="font-semibold text-red-600">Not in teacher list</span>
                    )}
                  </td>
                  <td className="td">
                    <select
                      className="input !py-1"
                      value={isNew ? "NEW" : isSame ? mapped! : mapped && byId.has(mapped) ? mapped : ""}
                      onChange={(e) => setMap(raw, e.target.value)}
                    >
                      <option value="">{id && !mapped ? "(automatic match)" : "— choose —"}</option>
                      <option value="NEW">+ Create new teacher “{raw}”</option>
                      {others.filter((o) => o !== raw).length > 0 && (
                        <optgroup label="Same person as another name in this document">
                          {others.filter((o) => o !== raw).map((o) => <option key={o} value={`SAME:${o}`}>{o}</option>)}
                        </optgroup>
                      )}
                      {teachers.length > 0 && (
                        <optgroup label="Teacher in the list">
                          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.code ? ` (${t.code})` : ""}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </td>
                </tr>
              );
            })}
            {!names.length && <tr><td colSpan={4} className="td text-slate-500">No teacher names in this draft.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
