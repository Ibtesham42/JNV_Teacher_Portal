"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { WEEKDAYS, dayLabel } from "@/lib/common";

type Teacher = { id: string; name: string; code: string | null };
type Slot = { day: string; start: string; end: string };

const WORKDAYS = WEEKDAYS.filter((d) => d !== "SUNDAY");

export default function GeneratorForm({
  teachers,
  defaultFrom,
  defaultTo,
  aiEnabled,
  hasRoutine,
}: {
  teachers: Teacher[];
  defaultFrom: string;
  defaultTo: string;
  aiEnabled: boolean;
  hasRoutine: boolean;
}) {
  const router = useRouter();
  const [make, setMake] = useState({ mod: true, holiday: true, weeklyOff: false, remedial: false });
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [workDays, setWorkDays] = useState<string[]>([...WORKDAYS]);
  const [holidays, setHolidays] = useState("");
  const [modPerDay, setModPerDay] = useState(1);
  const [holidayPerDay, setHolidayPerDay] = useState(2);
  const [minGap, setMinGap] = useState(3);
  const [slots, setSlots] = useState<Slot[]>(WORKDAYS.slice(0, 5).map((day) => ({ day, start: "16:30", end: "17:30" })));
  const [perWeek, setPerWeek] = useState(2);
  const [maxPerTeacher, setMaxPerTeacher] = useState(4);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const included = teachers.length - excluded.size;
  const shown = useMemo(() => teachers.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())), [teachers, filter]);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  async function generate() {
    setError("");
    const holidayList = holidays.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const bad = holidayList.find((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h));
    if (bad) return setError(`"${bad}" is not a date. Write extra holidays as YYYY-MM-DD, one per line.`);
    if (make.remedial && !slots.length) return setError("Add at least one remedial time slot.");
    setBusy(true);
    try {
      const r = await api<{ documentId: string }>("/api/admin/roster", {
        method: "POST",
        json: {
          from, to, make, workDays, holidays: holidayList, modPerDay, holidayPerDay, minGapDays: minGap,
          excludeTeacherIds: [...excluded], instructions,
          remedial: { slots, perWeek, maxPerTeacherPerWeek: maxPerTeacher },
        },
      });
      router.push(`/admin/review/${r.documentId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const check = (label: string, key: keyof typeof make, hint: string) => (
    <label className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", make[key] ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50")}>
      <input type="checkbox" className="mt-1" checked={make[key]} onChange={(e) => setMake({ ...make, [key]: e.target.checked })} />
      <span>
        <span className="block font-semibold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
  const num = (v: number, set: (n: number) => void, min: number, max: number) => (
    <input type="number" min={min} max={max} value={v} onChange={(e) => set(Math.min(max, Math.max(min, Number(e.target.value) || min)))} className="input w-20" />
  );

  return (
    <div className="space-y-6">
      <section className="card card-pad">
        <h2 className="font-bold text-slate-900">1. What should be generated?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {check("MOD (master on duty)", "mod", "One teacher a day on working days")}
          {check("Sunday / holiday duty", "holiday", "Teachers on duty on Sundays and holidays, each with a compensatory off the next week")}
          {check("Weekly off", "weeklyOff", "One weekly off day per teacher, spread across the week and put on the lightest teaching day")}
          {check("Remedial classes", "remedial", "Weekly remedial timetable from the current routine (needs a published routine)")}
        </div>
        {make.weeklyOff && <p className="mt-2 text-xs text-amber-800">Publishing will replace the weekly off of every selected teacher.</p>}
        {make.remedial && (
          <p className="mt-2 text-xs text-amber-800">
            {hasRoutine ? "Publishing will replace the current remedial / enrichment schedule." : "There is no published routine yet, so remedial classes cannot be generated."}
          </p>
        )}
      </section>

      <section className="card card-pad">
        <h2 className="font-bold text-slate-900">2. Period and rules</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-semibold text-slate-700">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 w-full" /></label>
          <label className="block text-sm font-semibold text-slate-700">To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input mt-1 w-full" /></label>
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="text-sm font-semibold text-slate-700">Working days (MOD)</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WORKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWorkDays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                  className={clsx("rounded-full px-3 py-1 text-xs font-semibold ring-1", workDays.includes(d) ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-500 ring-slate-200")}
                >
                  {dayLabel(d as never).slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-semibold text-slate-700">MOD teachers per day<span className="mt-1 block">{num(modPerDay, setModPerDay, 1, 5)}</span></label>
          <label className="block text-sm font-semibold text-slate-700">Sunday duty teachers per day<span className="mt-1 block">{num(holidayPerDay, setHolidayPerDay, 1, 10)}</span></label>
          <label className="block text-sm font-semibold text-slate-700">Rest days between duties<span className="mt-1 block">{num(minGap, setMinGap, 0, 7)}</span></label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">
            Extra holidays (no MOD; holiday duty instead), one date per line, YYYY-MM-DD
            <textarea value={holidays} onChange={(e) => setHolidays(e.target.value)} rows={2} placeholder={"2026-10-02\n2026-10-20"} className="input mt-1 w-full font-mono text-xs" />
          </label>
        </div>
      </section>

      {make.remedial && (
        <section className="card card-pad">
          <h2 className="font-bold text-slate-900">3. Remedial time slots</h2>
          <p className="text-xs text-slate-500">Every class-section gets the number of sessions below, spread over these slots, taken by a teacher of that class who is free and not off at that time.</p>
          <ul className="mt-3 space-y-2">
            {slots.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <select value={s.day} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} className="input w-36">
                  {WORKDAYS.map((d) => <option key={d} value={d}>{dayLabel(d as never)}</option>)}
                </select>
                <input type="time" value={s.start} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="input w-32" aria-label="Start" />
                <span className="text-slate-400">to</span>
                <input type="time" value={s.end} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="input w-32" aria-label="End" />
                <button type="button" onClick={() => setSlots(slots.filter((_, j) => j !== i))} className="btn btn-secondary btn-sm" aria-label="Remove slot"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setSlots([...slots, { day: "MONDAY", start: "16:30", end: "17:30" }])} className="btn btn-secondary btn-sm mt-2"><Plus className="h-4 w-4" /> Add slot</button>
          <div className="mt-4 flex flex-wrap gap-6">
            <label className="text-sm font-semibold text-slate-700">Sessions per class-section per week<span className="mt-1 block">{num(perWeek, setPerWeek, 1, 6)}</span></label>
            <label className="text-sm font-semibold text-slate-700">Most remedial classes per teacher per week<span className="mt-1 block">{num(maxPerTeacher, setMaxPerTeacher, 1, 10)}</span></label>
          </div>
        </section>
      )}

      <section className="card card-pad">
        <h2 className="font-bold text-slate-900">{make.remedial ? "4" : "3"}. Teachers to include <span className="text-sm font-normal text-slate-500">({included} of {teachers.length})</span></h2>
        <p className="text-xs text-slate-500">Untick anyone who should not get duty in this period (for example the principal, or a teacher on long leave).</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a teacher" className="input w-56" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExcluded(new Set())}>Select all</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExcluded(new Set(teachers.map((t) => t.id)))}>Select none</button>
        </div>
        <ul className="mt-3 grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={!excluded.has(t.id)} onChange={() => setExcluded(toggle(excluded, t.id))} />
                <span className="truncate">{t.name}</span>
                {t.code && <span className="ml-auto shrink-0 text-xs text-slate-400">{t.code}</span>}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card card-pad">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><Sparkles className="h-4 w-4 text-gold-600" /> Special requests (optional, AI reads them)</h2>
        <p className="text-xs text-slate-500">
          Write in your own words, for example: &ldquo;Anil Kumar is on leave 5 to 9 October. Bina Devi should not get Sunday duty. Chandan Roy wants Saturday off.&rdquo;
          The AI only turns this into rules for teachers in the list; you will see how it was understood on the next screen.
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          disabled={!aiEnabled}
          placeholder={aiEnabled ? "Leave empty if there is nothing special" : "AI is not configured (GROQ_API_KEY), so this box is off."}
          className="input mt-2 w-full disabled:bg-slate-50"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={generate} disabled={busy || included < 2} className="btn btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate roster
        </button>
        <span className="text-xs text-slate-500">You will review and edit the result before anything is published.</span>
        {error && <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
