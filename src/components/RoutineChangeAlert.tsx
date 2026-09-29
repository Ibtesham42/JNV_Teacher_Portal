"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

type Props = {
  version: number;
  teacherId: string;
  changes: { summary: string; before: string | null; after: string | null }[];
};

/** Dismissible "your routine changed" banner. Dismissal is per-device (localStorage) - nothing to sync, no server state needed. */
export default function RoutineChangeAlert({ version, teacherId, changes }: Props) {
  const key = `routine-change-dismissed-v${version}-${teacherId}`;
  const [dismissed, setDismissed] = useState(true); // avoid a flash before we can check localStorage

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key]);

  if (dismissed || !changes.length) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private browsing etc. - dismissal just won't persist */
    }
  }

  return (
    <div className="card card-pad border-2 border-brand-300 bg-brand-50">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 font-bold text-brand-800"><Bell className="h-4 w-4" /> YOUR ROUTINE CHANGED</p>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-brand-400 hover:text-brand-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-2 space-y-2 text-sm">
        {changes.map((c, i) => (
          <li key={i}>
            <p className="font-semibold text-slate-900">{c.summary}</p>
            {c.before && <p className="text-slate-600">Previous: {c.before}</p>}
            {c.after && <p className="text-slate-600">Now: {c.after}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
