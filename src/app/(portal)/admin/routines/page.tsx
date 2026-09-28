import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/ActionButton";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDateShort, isoFromDate } from "@/lib/time";

export const metadata: Metadata = { title: "Routine versions" };
export const dynamic = "force-dynamic";

export default async function RoutineVersions() {
  const routines = await db.routine.findMany({
    orderBy: { version: "desc" },
    include: { uploadedBy: { select: { name: true } }, _count: { select: { periods: true, classes: true } } },
  });
  return (
    <div>
      <PageHeader
        title="Routine versions"
        subtitle="Only one version is ACTIVE. A version with a future start date is SCHEDULED and switches on by itself that day."
        actions={<Link href="/admin/upload?kind=ROUTINE" className="btn btn-primary">Upload new routine</Link>}
      />
      {routines.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr>
                {["Version", "Title", "Uploaded", "Effective from", "By", "Contents", "Status", ""].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routines.map((r) => (
                <tr key={r.id}>
                  <td className="td font-bold">v{r.version}</td>
                  <td className="td">{r.title}{r.session && <span className="block text-xs text-slate-500">Session {r.session}</span>}</td>
                  <td className="td whitespace-nowrap">{formatDateShort(isoFromDate(r.publishedAt))}</td>
                  <td className="td whitespace-nowrap">{formatDateShort(isoFromDate(r.effectiveFrom))}</td>
                  <td className="td">{r.uploadedBy?.name ?? "—"}</td>
                  <td className="td text-xs text-slate-600">{r._count.classes} classes · {r._count.periods} periods</td>
                  <td className="td"><Pill tone={r.status === "ACTIVE" ? "green" : r.status === "SCHEDULED" ? "blue" : "slate"}>{r.status}</Pill></td>
                  <td className="td">
                    <div className="flex flex-wrap gap-2">
                      {r.documentId && (
                        <a className="btn btn-secondary btn-sm" href={`/api/documents/${r.documentId}/file`} target="_blank" rel="noopener noreferrer">Original</a>
                      )}
                      {r.status !== "ACTIVE" && (
                        <ActionButton label={r.status === "SCHEDULED" ? "Start now" : "Make active"} url={`/api/routines/${r.id}`} json={{ action: "activate" }} confirm={`Make version ${r.version} the routine everyone sees?`} variant="success" />
                      )}
                      {r.status === "ACTIVE" && (
                        <ActionButton label="Archive" url={`/api/routines/${r.id}`} json={{ action: "archive" }} confirm="Archive the active routine? Teachers will see no routine until one is activated." />
                      )}
                      {r.status !== "ACTIVE" && (
                        <ActionButton label="Delete" url={`/api/routines/${r.id}`} method="DELETE" variant="danger" confirm={`Delete version ${r.version}'s timetable data? The original document stays available.`} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No routine has been published yet.</Empty>
      )}
    </div>
  );
}
