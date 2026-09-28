"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import clsx from "clsx";
import { ChevronDown, Menu } from "lucide-react";

type NavItem = { href: string; label: string };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function DesktopNav({ links }: { links: NavItem[] }) {
  const path = usePathname();
  return (
    <ul className="hidden gap-1 overflow-x-auto py-1 md:flex">
      {links.map((l) => {
        const active = isActive(path, l.href);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition",
                active ? "bg-white/15 text-white shadow-[inset_0_-2px_0_0_#f9a03f]" : "text-brand-100 hover:bg-white/10 hover:text-white",
              )}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav({ links }: { links: NavItem[] }) {
  const path = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);

  // close the menu once a page has been chosen
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);

  return (
    <details ref={ref} className="group md:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm font-semibold text-brand-100 active:text-white [&::-webkit-details-marker]:hidden">
        <Menu className="h-4 w-4" /> Menu
        <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ul className="grid grid-cols-2 gap-1.5 pb-3">
        {links.map((l) => {
          const active = isActive(path, l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "block select-none rounded-md px-3 py-2.5 text-sm transition duration-150 ease-out active:scale-95 active:bg-gold-500 active:text-white",
                  active
                    ? "bg-gold-500/90 font-semibold text-white shadow-md ring-1 ring-gold-400"
                    : "bg-white/5 text-white hover:bg-white/15",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <form action="/search" className="pb-3">
        <input name="q" placeholder="Search..." className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-brand-200" />
      </form>
    </details>
  );
}
