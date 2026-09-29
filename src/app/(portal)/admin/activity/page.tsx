import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Empty, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<{ entity?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const entityType = sp.entity || "";

  const where = entityType ? { entityType } : {};
  const [entries, total, entityTypes] = await Promise.all([
    db.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.activityLog.count({ where }),
    db.activityLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Who changed what, and when - every admin action on teachers, MOD duty, weekly off, notices, routines, documents and settings." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/activity" className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold", !entityType ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")}>
          All
        </Link>
        {entityTypes.map((e) => (
          <Link
            key={e.entityType}
            href={`/admin/activity?entity=${encodeURIComponent(e.entityType)}`}
            className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold", entityType === e.entityType ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")}
          >
            {e.entityType}
          </Link>
        ))}
      </div>

      {entries.length ? (
        <div className="space-y-2">
          {entries.map((e) => (
            <details key={e.id} className="card card-pad group">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{e.summary}</p>
                  <p className="text-xs text-slate-500">
                    {e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {e.actorName} · <span className="font-mono">{e.action}</span>
                  </p>
                </div>
              </summary>
              {(e.oldValue != null || e.newValue != null) && (
                <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
                  {e.oldValue != null && (
                    <div>
                      <p className="mb-1 font-bold uppercase tracking-wide text-slate-400">Before</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-700">{JSON.stringify(e.oldValue, null, 2)}</pre>
                    </div>
                  )}
                  {e.newValue != null && (
                    <div>
                      <p className="mb-1 font-bold uppercase tracking-wide text-slate-400">After</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-700">{JSON.stringify(e.newValue, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </details>
          ))}
        </div>
      ) : (
        <Empty title="No activity recorded yet">Admin changes to teachers, MOD duty, weekly off, notices, routines, documents and settings will appear here.</Empty>
      )}

      {pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/activity?${entityType ? `entity=${encodeURIComponent(entityType)}&` : ""}page=${p}`}
              className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold", p === page ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
