import Link from "next/link";
import BrandLogo, { TricolourBar } from "@/components/BrandLogo";
import { DesktopNav, MobileNav } from "@/components/PortalNav";
import SignOutButton from "@/components/SignOutButton";
import { config } from "@/lib/config";
import { pageUser } from "@/lib/session";
import { Search, ShieldCheck } from "lucide-react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/me", label: "My Dashboard" },
  { href: "/routine/class", label: "Routine" },
  { href: "/mod", label: "MOD Duty" },
  { href: "/weekly-off", label: "Weekly Off" },
  { href: "/notices", label: "Notices" },
  { href: "/documents", label: "Documents" },
  { href: "/exams", label: "Exams" },
  { href: "/remedial", label: "Remedial & Enrichment" },
  { href: "/clubs", label: "Clubs" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const links = user.role === "ADMIN" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-900 text-white">
        <TricolourBar />
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <BrandLogo size="md" />
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
            <DesktopNav links={links} />
            <MobileNav links={links} />
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <TricolourBar />
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-5 text-center sm:flex-row sm:text-left">
          <BrandLogo size="sm" />
          <div className="text-xs text-slate-500">
            <p className="font-semibold text-slate-700">{config.schoolName}</p>
            <p>{config.schoolAddress}</p>
            <p className="mt-0.5">Navodaya Vidyalaya Samiti · Ministry of Education, Government of India</p>
          </div>
          <p className="text-sm font-semibold text-brand-800 sm:ml-auto" lang="hi">प्रज्ञानं ब्रह्म</p>
        </div>
      </footer>
    </div>
  );
}
