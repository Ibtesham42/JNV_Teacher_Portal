"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type T = { id: string; name: string; code: string | null; designation: string | null };

/** Type-ahead teacher search (mobile friendly). Picks go to the teacher's schedule. */
export default function TeacherSearch({
  placeholder = "Search teacher name...",
  autoFocus = false,
  target = "/teachers",
  big = false,
}: {
  placeholder?: string;
  autoFocus?: boolean;
  target?: string;
  big?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/teachers?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (res.ok) setResults((await res.json()).teachers ?? []);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    router.push(`${target}/${id}`);
  };

  return (
    <div ref={box} className="relative">
      <label htmlFor="teacher-search" className="sr-only">
        Search teacher
      </label>
      <Search className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 ${big ? "h-5 w-5" : "h-4 w-4"}`} />
      <input
        id="teacher-search"
        className={`input pl-10 ${big ? "py-3.5 text-base" : ""}`}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[active] ?? results[0]) go((results[active] ?? results[0]).id);
            else if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim() && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          {results.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-brand-50 ${i === active ? "bg-brand-50" : ""}`}
                onClick={() => go(t.id)}
              >
                <span className="font-medium text-slate-900">{t.name}</span>
                <span className="text-xs text-slate-500">{[t.designation, t.code].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="px-4 py-3 text-sm text-slate-500">{loading ? "Searching..." : "No teacher found with that name."}</li>
          )}
        </ul>
      )}
    </div>
  );
}
