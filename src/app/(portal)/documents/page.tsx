import type { Metadata } from "next";
import { DocLinks, Empty, formatBytes, PageHeader, Pill } from "@/components/ui";
import { getOfficialDocuments } from "@/lib/queries";
import { formatDateShort, isoFromDate } from "@/lib/time";

export const metadata: Metadata = { title: "Official Documents" };
export const dynamic = "force-dynamic";

const GROUPS: { key: string; title: string }[] = [
  { key: "ROUTINE", title: "Routine" },
  { key: "REMEDIAL", title: "Remedial & Enrichment Schedule" },
  { key: "CLUB", title: "Club Activities" },
  { key: "NOTICE", title: "Notice Attachments" },
  { key: "OTHER", title: "Other Documents" },
];

export default async function DocumentsPage() {
  const docs = await getOfficialDocuments();
  return (
    <div className="space-y-8">
      <PageHeader title="Official Documents" subtitle="The original uploaded files - never modified." />
      {!docs.length && <Empty>No official documents yet.</Empty>}
      {GROUPS.map((g) => {
        const list = docs.filter((d) => d.kind === g.key);
        if (!list.length) return null;
        return (
          <section key={g.key}>
            <h2 className="mb-3 text-lg font-bold text-slate-900">{g.title}</h2>
            <ul className="space-y-2">
              {list.map((d) => {
                const r = d.routines[0];
                const label = g.key === "ROUTINE" && r ? (r.status === "ACTIVE" ? "Current Routine" : `Previous Routine (v${r.version})`) : null;
                return (
                  <li key={d.id} className="card card-pad flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{d.title}</p>
                        {label && <Pill tone={r?.status === "ACTIVE" ? "green" : "slate"}>{label}</Pill>}
                      </div>
                      <p className="text-xs text-slate-500">
                        {d.originalName} · {formatBytes(d.sizeBytes)} · {formatDateShort(isoFromDate(d.createdAt))}
                      </p>
                    </div>
                    <DocLinks id={d.id} size="md" />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
