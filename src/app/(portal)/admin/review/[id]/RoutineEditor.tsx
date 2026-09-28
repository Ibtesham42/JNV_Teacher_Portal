"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2, X } from "lucide-react";
import type { ExtractedPeriod } from "@/lib/extraction/schema";
import { dayLabel, newId, WEEKDAYS, type WeekdayName } from "@/lib/common";
import type { DraftData, ItemIssues } from "./types";

type Col = { slot: number; number: number | null; isBreak: boolean; label: string | null; start: string | null; end: string | null };

const keyOf = (className: string, section: string) => `${className}|${section}`;
const labelOf = (key: string) => {
  const [c, s] = key.split("|");
  return s ? `${c}-${s}` : c || "?";
};
const rank = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function deriveColumns(rows: ExtractedPeriod[]): Col[] {
  const map = new Map<number, Col>();
  for (const p of [...rows].sort((a, b) => a.slot - b.slot)) {
    const cur = map.get(p.slot);
    if (!cur) map.set(p.slot, { slot: p.slot, number: p.periodNumber, isBreak: p.isBreak, label: p.label, start: p.startTime, end: p.endTime });
    else {
      if (!cur.start && p.startTime) cur.start = p.startTime;
      if (!cur.end && p.endTime) cur.end = p.endTime;
    }
  }
  return [...map.values()].sort((a, b) => a.slot - b.slot);
}

export default function RoutineEditor({
  data,
  setData,
  issues,
  classes,
  sections,
  lowConfidence,
}: {
  data: DraftData;
  setData: (fn: (d: DraftData) => DraftData) => void;
  issues: ItemIssues;
  classes: string[];
  sections: string[];
  lowConfidence: number;
}) {
  const [pending, setPending] = useState<string[]>([]);
  const [extra, setExtra] = useState<Record<string, Col[]>>({});
  const [extraDays, setExtraDays] = useState<Record<string, WeekdayName[]>>({});

  const classKeys = useMemo(() => {
    const set = new Set<string>(data.periods.map((p) => keyOf(p.className, p.section)));
    pending.forEach((k) => set.add(k));
    return [...set].sort((a, b) => {
      const [ca, sa] = a.split("|");
      const [cb, sb] = b.split("|");
      return (rank.indexOf(ca) + 1 || 99) - (rank.indexOf(cb) + 1 || 99) || sa.localeCompare(sb);
    });
  }, [data.periods, pending]);

  const [selRaw, setSel] = useState<string>("");
  const sel = classKeys.includes(selRaw) ? selRaw : classKeys[0] ?? "";
  const [selClass, selSection] = sel.split("|");

  const rows = useMemo(() => data.periods.filter((p) => keyOf(p.className, p.section) === sel), [data.periods, sel]);
  const derived = useMemo(() => deriveColumns(rows), [rows]);
  const columns = useMemo(() => {
    const map = new Map<number, Col>();
    for (const c of extra[sel] ?? []) map.set(c.slot, c);
    for (const c of derived) map.set(c.slot, c);
    return [...map.values()].sort((a, b) => a.slot - b.slot);
  }, [derived, extra, sel]);
  const days = useMemo(() => {
    const set = new Set<WeekdayName>(rows.map((r) => r.day));
    (extraDays[sel] ?? []).forEach((d) => set.add(d));
    return WEEKDAYS.filter((d) => set.has(d));
  }, [rows, extraDays, sel]);

  const cellOf = useMemo(() => {
    const m = new Map<string, ExtractedPeriod>();
    for (const r of rows) m.set(`${r.day}|${r.slot}`, r);
    return m;
  }, [rows]);

  const issueCount = (key: string) => {
    let e = 0;
    let w = 0;
    for (const p of data.periods) {
      if (keyOf(p.className, p.section) !== key) continue;
      for (const i of issues.get(p.id) ?? []) i.severity === "error" ? e++ : w++;
    }
    return { e, w };
  };

  // ---------- mutations
  const patchRow = (id: string, patch: Partial<ExtractedPeriod>) =>
    setData((d) => ({ ...d, periods: d.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  function setCell(day: WeekdayName, col: Col, field: "subject" | "teacherName", value: string) {
    const existing = cellOf.get(`${day}|${col.slot}`);
    if (existing) {
      patchRow(existing.id, { [field]: value, confidence: null } as Partial<ExtractedPeriod>);
      return;
    }
    if (!value.trim()) return;
    const row: ExtractedPeriod = {
      id: newId("p"),
      className: selClass,
      section: selSection,
      day,
      slot: col.slot,
      periodNumber: col.isBreak ? null : col.number,
      isBreak: col.isBreak,
      label: col.label,
      startTime: col.start,
      endTime: col.end,
      subject: field === "subject" ? value : "",
      teacherName: field === "teacherName" ? value : "",
      room: null,
      confidence: null,
    };
    setData((d) => ({ ...d, periods: [...d.periods, row] }));
  }

  function setColumn(col: Col, patch: Partial<Col>) {
    setExtra((e) => ({ ...e, [sel]: [...(e[sel] ?? []).filter((c) => c.slot !== col.slot), { ...col, ...patch }] }));
    setData((d) => ({
      ...d,
      periods: d.periods.map((p) =>
        keyOf(p.className, p.section) === sel && p.slot === col.slot
          ? {
              ...p,
              ...(patch.number !== undefined && !p.isBreak ? { periodNumber: patch.number } : {}),
              ...(patch.start !== undefined ? { startTime: patch.start } : {}),
              ...(patch.end !== undefined ? { endTime: patch.end } : {}),
            }
          : p,
      ),
    }));
  }

  function addColumn(isBreak: boolean) {
    const slot = (columns.at(-1)?.slot ?? -1) + 1;
    const number = isBreak ? null : Math.max(0, ...columns.map((c) => c.number ?? 0)) + 1;
    setExtra((e) => ({ ...e, [sel]: [...(e[sel] ?? []), { slot, number, isBreak, label: isBreak ? "BREAK" : null, start: null, end: null }] }));
  }

  function removeColumn(col: Col) {
    if (!window.confirm(`Delete this column (${col.isBreak ? "break" : "period " + col.number}) for the whole class?`)) return;
    setExtra((e) => ({ ...e, [sel]: (e[sel] ?? []).filter((c) => c.slot !== col.slot) }));
    setData((d) => ({ ...d, periods: d.periods.filter((p) => !(keyOf(p.className, p.section) === sel && p.slot === col.slot)) }));
  }

  function removeClass() {
    if (!window.confirm(`Remove Class ${labelOf(sel)} from this draft?`)) return;
    setPending((p) => p.filter((k) => k !== sel));
    setData((d) => ({ ...d, periods: d.periods.filter((p) => keyOf(p.className, p.section) !== sel) }));
  }

  function removeDay(day: WeekdayName) {
    if (!window.confirm(`Remove ${dayLabel(day)} for Class ${labelOf(sel)}?`)) return;
    setExtraDays((e) => ({ ...e, [sel]: (e[sel] ?? []).filter((x) => x !== day) }));
    setData((d) => ({ ...d, periods: d.periods.filter((p) => !(keyOf(p.className, p.section) === sel && p.day === day)) }));
  }

  /** Copy period numbers, times and the break from another class of this document (an explicit admin choice). */
  function copyLayoutFrom(sourceKey: string) {
    const src = deriveColumns(data.periods.filter((p) => keyOf(p.className, p.section) === sourceKey));
    if (!src.length) return;
    const srcRows = data.periods.filter((p) => keyOf(p.className, p.section) === sourceKey);
    const daysHere = days.length ? days : ([...new Set(srcRows.map((r) => r.day))] as WeekdayName[]);
    setExtra((e) => ({ ...e, [sel]: src.map((c) => ({ ...c })) }));
    setData((d) => {
      const own = d.periods.filter((p) => keyOf(p.className, p.section) === sel);
      const other = d.periods.filter((p) => keyOf(p.className, p.section) !== sel);
      const byNumber = new Map(src.filter((c) => !c.isBreak).map((c) => [c.number, c]));
      const updated = own
        .filter((p) => !p.isBreak)
        .map((p) => {
          const c = byNumber.get(p.periodNumber);
          return c ? { ...p, slot: c.slot, startTime: c.start, endTime: c.end } : p;
        });
      const breaks: ExtractedPeriod[] = [];
      for (const c of src.filter((x) => x.isBreak)) {
        for (const day of daysHere) {
          breaks.push({
            id: newId("p"), className: selClass, section: selSection, day, slot: c.slot, periodNumber: null, isBreak: true,
            label: c.label ?? "BREAK", startTime: c.start, endTime: c.end, subject: "", teacherName: "", room: null, confidence: null,
          });
        }
      }
      return { ...d, periods: [...other, ...updated, ...breaks] };
    });
  }

  const [newClass, setNewClass] = useState("");
  const [newSection, setNewSection] = useState("");
  function addClass() {
    if (!newClass) return;
    const key = keyOf(newClass, newSection);
    if (classKeys.includes(key)) return setSel(key);
    // copy the column layout (numbers/times) of the current class as a starting point
    const template = columns.length
      ? columns
      : [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => ({ slot: i, number: n, isBreak: false, label: null, start: null, end: null }) as Col);
    setExtra((e) => ({ ...e, [key]: template.map((c) => ({ ...c })) }));
    setExtraDays((e) => ({ ...e, [key]: (days.length ? days : (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as WeekdayName[])) }));
    setPending((p) => [...p, key]);
    setSel(key);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Routine title</label>
          <input className="input" value={data.title} maxLength={160} onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))} />
        </div>
        <div>
          <label className="label">Academic session</label>
          <input className="input" placeholder="e.g. 2025-26" value={data.session ?? ""} maxLength={40} onChange={(e) => setData((d) => ({ ...d, session: e.target.value || null }))} />
        </div>
      </div>

      <div>
        <p className="section-title mb-2">Classes found ({classKeys.length})</p>
        <div className="flex flex-wrap items-center gap-2">
          {classKeys.map((k) => {
            const c = issueCount(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSel(k)}
                className={clsx("rounded-lg px-3 py-1.5 text-sm font-bold ring-1", k === sel ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100")}
              >
                {labelOf(k)}
                {c.e > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{c.e}</span>}
                {c.e === 0 && c.w > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] text-amber-950">{c.w}</span>}
              </button>
            );
          })}
          <div className="flex items-center gap-1">
            <select className="input !w-auto !py-1.5" value={newClass} onChange={(e) => setNewClass(e.target.value)} aria-label="Class to add">
              <option value="">+ Class</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="input !w-auto !py-1.5" value={newSection} onChange={(e) => setNewSection(e.target.value)} aria-label="Section to add">
              <option value="">No section</option>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addClass} disabled={!newClass}><Plus className="h-3 w-3" /> Add</button>
          </div>
        </div>
      </div>

      {!sel ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No class timetable was extracted. Add a class above and type the timetable in by hand.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
            <h3 className="font-bold text-slate-900">Class {labelOf(sel)}</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addColumn(false)}><Plus className="h-3 w-3" /> Period column</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addColumn(true)}><Plus className="h-3 w-3" /> Break column</button>
              <select
                className="input !w-auto !py-1 text-xs"
                value=""
                aria-label="Add day"
                onChange={(e) => e.target.value && setExtraDays((x) => ({ ...x, [sel]: [...(x[sel] ?? []), e.target.value as WeekdayName] }))}
              >
                <option value="">+ Day</option>
                {WEEKDAYS.filter((d) => !days.includes(d)).map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
              </select>
              {classKeys.length > 1 && (
                <select
                  className="input !w-auto !py-1 text-xs"
                  value=""
                  aria-label="Copy times and break from another class"
                  onChange={(e) => e.target.value && window.confirm(`Copy period times and the break from Class ${labelOf(e.target.value)} to Class ${labelOf(sel)}?`) && copyLayoutFrom(e.target.value)}
                >
                  <option value="">Copy times from…</option>
                  {classKeys.filter((k) => k !== sel).map((k) => <option key={k} value={k}>Class {labelOf(k)}</option>)}
                </select>
              )}
              <button type="button" className="btn btn-danger btn-sm" onClick={removeClass}><Trash2 className="h-3 w-3" /> Remove class</button>
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th sticky left-0 z-10 min-w-[92px]">Day</th>
                {columns.map((c) => (
                  <th key={c.slot} className={clsx("th min-w-[150px] align-top", c.isBreak && "bg-amber-50")}>
                    <div className="flex items-center gap-1">
                      {c.isBreak ? (
                        <span className="font-bold text-amber-700">BREAK</span>
                      ) : (
                        <>
                          <span className="text-[10px]">Period</span>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            className="input !w-14 !px-1.5 !py-0.5 text-xs"
                            value={c.number ?? ""}
                            onChange={(e) => setColumn(c, { number: e.target.value ? Number(e.target.value) : null })}
                            aria-label="Period number"
                          />
                        </>
                      )}
                      <button type="button" className="ml-auto text-slate-400 hover:text-red-600" onClick={() => removeColumn(c)} aria-label="Delete column"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-1 flex items-center gap-1 normal-case">
                      <input type="time" className="input !px-1 !py-0.5 text-xs" value={c.start ?? ""} onChange={(e) => setColumn(c, { start: e.target.value || null })} aria-label="Start time" />
                      <span className="text-slate-400">–</span>
                      <input type="time" className="input !px-1 !py-0.5 text-xs" value={c.end ?? ""} onChange={(e) => setColumn(c, { end: e.target.value || null })} aria-label="End time" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <td className="td sticky left-0 z-10 bg-white font-bold">
                    <div className="flex items-center justify-between gap-1">
                      {dayLabel(day)}
                      <button type="button" className="text-slate-300 hover:text-red-600" onClick={() => removeDay(day)} aria-label={`Remove ${dayLabel(day)}`}><X className="h-3 w-3" /></button>
                    </div>
                  </td>
                  {columns.map((c) => {
                    const row = cellOf.get(`${day}|${c.slot}`);
                    if (c.isBreak) {
                      return (
                        <td key={c.slot} className="td bg-amber-50 text-center text-xs font-semibold uppercase text-amber-700">
                          {row ? "Break" : (
                            <button type="button" className="text-amber-500 hover:underline" onClick={() => setCell(day, c, "subject", "BREAK")}>+ break</button>
                          )}
                        </td>
                      );
                    }
                    const its = row ? issues.get(row.id) ?? [] : [];
                    const hasErr = its.some((i) => i.severity === "error");
                    const low = row?.confidence != null && row.confidence < lowConfidence;
                    const warn = its.length > 0 && !hasErr;
                    return (
                      <td
                        key={c.slot}
                        className={clsx("td p-1.5", hasErr && "bg-red-50 ring-1 ring-inset ring-red-300", !hasErr && (warn || low) && "bg-amber-50 ring-1 ring-inset ring-amber-300")}
                        title={its.map((i) => i.message).join("\n") || undefined}
                      >
                        <input
                          className="input !px-2 !py-1 text-xs font-semibold"
                          placeholder="Subject"
                          value={row?.subject ?? ""}
                          onChange={(e) => setCell(day, c, "subject", e.target.value)}
                          aria-label={`${dayLabel(day)} period ${c.number} subject`}
                        />
                        <input
                          className="input mt-1 !px-2 !py-1 text-xs"
                          placeholder="Teacher"
                          list="teacher-options"
                          value={row?.teacherName ?? ""}
                          onChange={(e) => setCell(day, c, "teacherName", e.target.value)}
                          aria-label={`${dayLabel(day)} period ${c.number} teacher`}
                        />
                        {row?.confidence != null && (
                          <p className={clsx("mt-0.5 text-[10px] font-semibold", row.confidence < lowConfidence ? "text-amber-700" : "text-slate-400")}>
                            {Math.round(row.confidence * 100)}% confident
                          </p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!days.length && (
                <tr>
                  <td className="td text-slate-500" colSpan={columns.length + 1}>No days yet — use “+ Day”.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Amber cells have low confidence or a warning; red cells have an error that blocks publishing. Hover a cell to read the message. Editing a cell removes its confidence score (it is now verified by you).
      </p>
    </div>
  );
}
