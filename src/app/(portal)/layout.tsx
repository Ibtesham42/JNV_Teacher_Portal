import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { config } from "@/lib/config";
import { pageUser } from "@/lib/session";
import { Menu, Search, ShieldCheck } from "lucide-react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/me", label: "My Dashboard" },
  { href: "/routine/class", label: "Routine" },
  { href: "/mod", label: "MOD Duty" },
  { href: "/weekly-off", label: "Weekly Off" },
  { href: "/notices", label: "Notices" },
  { href: "/documents", label: "Documents" },
  { href: "/remedial", label: "Remedial & Enrichment" },
  { href: "/clubs", label: "Clubs" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const links = user.role === "ADMIN" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg font-black text-gold-400">J</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold tracking-wide sm:text-base">{config.schoolName}</span>
              <span className="block truncate text-[11px] text-brand-200 sm:text-xs">{config.portalName}</span>
            </span>
          </Link>

          <form action="/search" className="ml-auto hidden max-w-xs flex-1 md:block">
            <label htmlFor="global-search" className="sr-only">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-200" />
              <input
                id="global-search"
                name="q"
                placeholder="Search teacher, class, subject..."
                className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pl-9 pr-3 text-sm text-white placeholder:text-brand-200 focus:bg-white focus:text-slate-900 focus:placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <Link href="/change-password" className="block font-semibold hover:underline" title="Change password">{user.name}</Link>
              <span className="flex items-center justify-end gap-1 text-brand-200">
                {user.role === "ADMIN" && <ShieldCheck className="h-3 w-3" />}
                {user.role === "ADMIN" ? "Administrator" : "Teacher"}
              </span>
            </span>
            <SignOutButton />
          </div>
        </div>

        <nav className="border-t border-white/10 bg-brand-950/40" aria-label="Main">
          <div className="mx-auto max-w-7xl px-4">
            <ul className="hidden gap-1 overflow-x-auto py-1 md:flex">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10 hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <details className="group md:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm font-semibold text-brand-100">
                <Menu className="h-4 w-4" /> Menu
              </summary>
              <ul className="grid grid-cols-2 gap-1 pb-3">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="block rounded-md bg-white/5 px-3 py-2.5 text-sm text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <form action="/search" className="pb-3">
                <input name="q" placeholder="Search..." className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-brand-200" />
              </form>
            </details>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        {config.schoolName}, {config.schoolAddress}
      </footer>
    </div>
  );
}
