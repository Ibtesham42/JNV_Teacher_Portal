import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { globalSearch } from "@/lib/search";
import { pageUser } from "@/lib/session";
import { formatDateShort, isoFromDate } from "@/lib/time";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="section-title mb-2">{title}</h2>
      <ul className="card divide-y divide-slate-100">{children}</ul>
    </section>
  );
}
const row = "block px-4 py-3 text-sm hover:bg-slate-50";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await pageUser();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const r = q ? await globalSearch(q, user.role === "ADMIN") : null;
  const total = r ? r.teachers.length + r.classes.length + r.subjects.length + r.clubs.length + r.notices.length + r.documents.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Search" subtitle="Teachers, classes, subjects, clubs, notices and documents" />
      <form action="/search" className="flex max-w-2xl gap-2">
        <input name="q" defaultValue={q} placeholder="Search..." className="input" autoFocus />
        <button className="btn btn-primary">Search</button>
      </form>

      {r && total === 0 && <p className="text-slate-500">Nothing found for “{q}”.</p>}

      {r && r.teachers.length > 0 && (
        <Group title="Teachers">
          {r.teachers.map((t) => (
            <li key={t.id}>
              <Link className={row} href={`/teachers/${t.id}`}>
                <span className="font-semibold text-slate-900">{t.name}</span>
                <span className="ml-2 text-xs text-slate-500">{[t.designation, t.code].filter(Boolean).join(" · ")}</span>
              </Link>
            </li>
          ))}
        </Group>
      )}
      {r && r.classes.length > 0 && (
        <Group title="Classes">
          {r.classes.map((c) => (
            <li key={c.label}>
              <Link className={row} href={`/routine/class?class=${c.className}&section=${c.section}`}>
                <span className="font-semibold text-slate-900">Class {c.label}</span> <span className="text-xs text-slate-500">weekly timetable</span>
              </Link>
            </li>
          ))}
        </Group>
      )}
      {r && r.subjects.length > 0 && (
        <Group title="Subjects">
          {r.subjects.map((s) => (
            <li key={s.name} className="px-4 py-3 text-sm">
              <span className="font-semibold text-slate-900">{s.name}</span>
              <span className="ml-2 text-slate-600">
                {s.teachers.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ", "}
                    <Link href={`/teachers/${t.id}`} className="text-brand-700 hover:underline">{t.name}</Link>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </Group>
      )}
      {r && r.clubs.length > 0 && (
        <Group title="Clubs">
          {r.clubs.map((c) => (
            <li key={c.id}><Link className={row} href="/clubs">{c.name}</Link></li>
          ))}
        </Group>
      )}
      {r && r.notices.length > 0 && (
        <Group title="Notices">
          {r.notices.map((n) => (
            <li key={n.id}>
              <Link className={row} href="/notices">
                {n.title} <span className="text-xs text-slate-500">· {formatDateShort(isoFromDate(n.date))}</span>
              </Link>
            </li>
          ))}
        </Group>
      )}
      {r && r.documents.length > 0 && (
        <Group title="Documents">
          {r.documents.map((d) => (
            <li key={d.id}>
              <a className={row} href={`/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer">{d.title}</a>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}
