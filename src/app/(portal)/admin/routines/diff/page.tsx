import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Minus, Pencil, Plus } from "lucide-react";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { classLabel, getAllPeriods } from "@/lib/queries";
import { describePeriod, describeSlot, diffPeriods } from "@/lib/routineDiff";

export const metadata: Metadata = { title: "What changed" };
export const dynamic = "force-dynamic";

export default async function RoutineDiffPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  if (!from || !to) {
    return (
      <div>
        <PageHeader title="What changed" />
        <Empty title="Pick two versions">Go to Routine versions and use "Compare version ... with ..." to see what changed.</Empty>
      </div>
    );
  }

  const [fromRoutine, toRoutine] = await Promise.all([
    db.routine.findUnique({ where: { id: from } }),
    db.routine.findUnique({ where: { id: to } }),
  ]);
  if (!fromRoutine || !toRoutine) {
    return (
      <div>
        <PageHeader title="What changed" />
        <Empty title="Version not found">One of the selected routine versions no longer exists.</Empty>
      </div>
    );
  }

  const [fromPeriods, toPeriods] = await Promise.all([getAllPeriods(fromRoutine.id), getAllPeriods(toRoutine.id)]);
  const diffs = diffPeriods(fromPeriods, toPeriods);
  const added = diffs.filter((d) => d.kind === "added");
  const removed = diffs.filter((d) => d.kind === "removed");
  const changed = diffs.filter((d) => d.kind === "changed");

  return (
    <div className="space-y-6">
      <PageHeader
        title="What changed"
        subtitle={`Version ${fromRoutine.version} (${fromRoutine.title}) vs Version ${toRoutine.version} (${toRoutine.title})`}
        actions={<Link href="/admin/routines" className="btn btn-secondary">Back to routine versions</Link>}
      />

      {!diffs.length ? (
        <Empty title="No differences">These two versions have identical teaching periods.</Empty>
      ) : (
        <>
          {changed.length > 0 && (
            <section>
              <h2 className="section-title mb-2 flex items-center gap-2 text-amber-700"><Pencil className="h-4 w-4" /> Changed ({changed.length})</h2>
              <ul className="space-y-2">
                {changed.map((d, i) => (
                  <li key={i} className="card card-pad">
                    <p className="text-sm font-bold text-slate-900">{describeSlot(d)} · {d.after.periodNumber != null ? `Period ${d.after.periodNumber}` : "Period"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <Pill tone="slate">{describePeriod(d.before)}</Pill>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                      <Pill tone="amber">{describePeriod(d.after)}</Pill>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {added.length > 0 && (
            <section>
              <h2 className="section-title mb-2 flex items-center gap-2 text-emerald-700"><Plus className="h-4 w-4" /> Added ({added.length})</h2>
              <ul className="space-y-2">
                {added.map((d, i) => (
                  <li key={i} className="card card-pad">
                    <p className="text-sm font-bold text-slate-900">{describeSlot(d)} · {d.period.periodNumber != null ? `Period ${d.period.periodNumber}` : "Period"}</p>
                    <Pill tone="green">{describePeriod(d.period)}</Pill>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {removed.length > 0 && (
            <section>
              <h2 className="section-title mb-2 flex items-center gap-2 text-red-700"><Minus className="h-4 w-4" /> Removed ({removed.length})</h2>
              <ul className="space-y-2">
                {removed.map((d, i) => (
                  <li key={i} className="card card-pad">
                    <p className="text-sm font-bold text-slate-900">{describeSlot(d)} · {d.period.periodNumber != null ? `Period ${d.period.periodNumber}` : "Period"}</p>
                    <Pill tone="red">{describePeriod(d.period)}</Pill>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
