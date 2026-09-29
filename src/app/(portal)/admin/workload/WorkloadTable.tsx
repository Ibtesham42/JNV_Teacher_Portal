"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";

type Row = { id: string; name: string; designation: string | null; periodsPerWeek: number; classes: number; modDuties: number; freeTimePerWeek: string };
type SortKey = "name" | "periodsPerWeek" | "classes" | "modDuties";

const columns: { key: SortKey; label: string }[] = [
  { key: "name", label: "Teacher" },
  { key: "periodsPerWeek", label: "Periods/week" },
  { key: "classes", label: "Classes" },
  { key: "modDuties", label: "MOD duties" },
];

export default function WorkloadTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const list = useMemo(() => {
    const filtered = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
      return cmp * sort.dir;
    });
  }, [rows, q, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  return (
    <div className="space-y-4">
      <input className="input max-w-xs" placeholder="Filter teachers..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="th cursor-pointer select-none" onClick={() => toggleSort(c.key)}>
                  <span className="inline-flex items-center gap-1">{c.label} <ArrowDownUp className="h-3 w-3 opacity-50" /></span>
                </th>
              ))}
              <th className="th">Free time/week</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td className="td font-semibold text-slate-900">{r.name}{r.designation && <span className="block text-xs font-normal text-slate-500">{r.designation}</span>}</td>
                <td className="td">{r.periodsPerWeek}</td>
                <td className="td">{r.classes}</td>
                <td className="td">{r.modDuties}</td>
                <td className="td text-slate-600">{r.freeTimePerWeek}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="td text-slate-500">No teachers match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
