"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function NavTabs({ items }: { items: { href: string; label: string; match: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
      {items.map((t) => {
        const active = t.exact ? path === t.match : path === t.match || path.startsWith(t.match + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={clsx(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition",
              active ? "bg-brand-700 text-white shadow-card" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
