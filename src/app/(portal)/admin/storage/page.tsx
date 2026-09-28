import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import ActionButton from "@/components/ActionButton";
import { formatBytes, PageHeader } from "@/components/ui";
import { getStorageReport, planData, planDocuments, RETENTION_CHOICES } from "@/lib/storageCleanup";
import DocCleanup from "./DocCleanup";

export const metadata: Metadata = { title: "Storage & clean-up" };
export const dynamic = "force-dynamic";

function Row({ title, detail, count, action }: { title: string; detail: string; count: number; action: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{title} <span className="text-slate-400">({count})</span></p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      {count > 0 ? action : <span className="text-xs text-slate-400">Nothing to clean</span>}
    </li>
  );
}

export default async function StoragePage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const sp = await searchParams;
  const months = (RETENTION_CHOICES as readonly number[]).includes(Number(sp.months)) ? Number(sp.months) : 12;
  const [report, docs, data] = await Promise.all([getStorageReport(), planDocuments(months), planData(months)]);
  const pct = Math.min(100, (report.usedBytes / report.limitBytes) * 100);
  const tone = pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-500" : "bg-leaf-600";
  const maxTable = Math.max(1, ...report.tables.map((t) => t.bytes));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Storage & clean-up"
        subtitle="Free database space is limited. Remove routines, documents and records that are no longer used."
      />

      <section className="card card-pad">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-lg font-bold text-slate-900">{formatBytes(report.usedBytes)} <span className="text-sm font-normal text-slate-500">of {formatBytes(report.limitBytes)} used ({pct.toFixed(1)}%)</span></p>
          <p className="text-xs text-slate-500">{report.fileCount} uploaded document(s) · {formatBytes(report.fileBytes)} of originals</p>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className={clsx("h-full rounded-full transition-all", tone)} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <ul className="mt-4 space-y-1.5">
          {report.tables.map((t) => (
            <li key={t.name} className="flex items-center gap-3 text-xs">
              <span className="w-48 shrink-0 truncate text-slate-600">{t.name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded bg-slate-100"><span className="block h-full rounded bg-brand-500" style={{ width: `${(t.bytes / maxTable) * 100}%` }} /></span>
              <span className="w-16 shrink-0 text-right tabular-nums text-slate-500">{formatBytes(t.bytes)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">Treat things older than</p>
          {RETENTION_CHOICES.map((m) => (
            <Link
              key={m}
              href={`/admin/storage?months=${m}`}
              className={clsx("rounded-full px-3 py-1 text-xs font-semibold ring-1", m === months ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-100")}
            >
              {m} months
            </Link>
          ))}
        </div>
        <div className="card card-pad">
          <h2 className="font-bold text-slate-900">Old data</h2>
          <p className="text-xs text-slate-500">Only history is removed. What teachers see today (current routine, upcoming duties, live notices) is never touched.</p>
          <ul className="mt-2 divide-y divide-slate-100">
            <Row
              title="Old routine versions"
              detail={`${data.routines.periods} periods. Archived versions older than ${months} months; the 2 newest archived versions are always kept for rollback.`}
              count={data.routines.count}
              action={<ActionButton label="Delete" variant="danger" url="/api/admin/storage" json={{ action: "purge-routines", months }} confirm={`Delete ${data.routines.count} old routine version(s)? Their original documents are not affected.`} />}
            />
            <Row
              title="Past MOD / holiday duty entries"
              detail={`Duty dates more than ${months} months ago.`}
              count={data.duties.count}
              action={<ActionButton label="Delete" variant="danger" url="/api/admin/storage" json={{ action: "purge-duties", months }} confirm={`Delete ${data.duties.count} past duty entries?`} />}
            />
            <Row
              title="Archived notices"
              detail={`Archived notices dated more than ${months} months ago.`}
              count={data.notices.count}
              action={<ActionButton label="Delete" variant="danger" url="/api/admin/storage" json={{ action: "purge-notices", months }} confirm={`Delete ${data.notices.count} archived notice(s)?`} />}
            />
            <Row
              title="Extraction text of finished documents"
              detail={`OCR text kept only for reference (${formatBytes(data.draftText.bytes)}). Published data is not affected.`}
              count={data.draftText.count}
              action={<ActionButton label="Clear" variant="danger" url="/api/admin/storage" json={{ action: "trim-text" }} confirm="Clear the saved OCR text of published / cancelled / failed documents?" />}
            />
            <Row
              title="Unattached files"
              detail={`Stored files that no document points to (${formatBytes(data.orphans.bytes)}), left behind by interrupted uploads.`}
              count={data.orphans.count}
              action={<ActionButton label="Delete" variant="danger" url="/api/admin/storage" json={{ action: "purge-orphans" }} confirm={`Delete ${data.orphans.count} unattached file(s)?`} />}
            />
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-slate-900">Documents no longer used</h2>
        <p className="mb-3 text-xs text-slate-500">
          Archived, cancelled or failed uploads and files replaced by a newer one are pre-selected. Older documents that are not linked to anything live are listed too, but not pre-selected. A document that is the current routine, a live schedule or club list, or still being processed never appears here.
        </p>
        <DocCleanup key={`${months}-${docs.candidates.length}`} candidates={docs.candidates} />
      </section>
    </div>
  );
}
