"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Opt = { id: string; version: number; title: string };

/** Picks two routine versions and opens the diff page - "what changed" between them. */
export default function CompareForm({ routines }: { routines: Opt[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(routines[1]?.id ?? "");
  const [to, setTo] = useState(routines[0]?.id ?? "");

  if (routines.length < 2) return null;

  return (
    <form
      className="card card-pad flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (from && to && from !== to) router.push(`/admin/routines/diff?from=${from}&to=${to}`);
      }}
    >
      <div>
        <label className="label" htmlFor="cmp-from">Compare version</label>
        <select id="cmp-from" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)}>
          {routines.map((r) => <option key={r.id} value={r.id}>v{r.version} - {r.title}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="cmp-to">with</label>
        <select id="cmp-to" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)}>
          {routines.map((r) => <option key={r.id} value={r.id}>v{r.version} - {r.title}</option>)}
        </select>
      </div>
      <button className="btn btn-secondary" disabled={!from || !to || from === to}>What changed?</button>
    </form>
  );
}
