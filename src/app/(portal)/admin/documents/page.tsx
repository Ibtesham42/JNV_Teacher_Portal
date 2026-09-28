import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "@/components/ActionButton";
import { Empty, formatBytes, PageHeader, Pill } from "@/components/ui";
import { GENERATED_MIME } from "@/lib/common";
import { db } from "@/lib/db";
import { failStaleExtractions } from "@/lib/extraction/pipeline";
import { formatDateShort, isoFromDate } from "@/lib/time";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

const tone = {
  NOT_APPLICABLE: "slate", QUEUED: "blue", PROCESSING: "blue", REVIEW: "amber", FAILED: "red", PUBLISHED: "green", CANCELLED: "slate",
} as const;
const label = { NOT_APPLICABLE: "Stored", QUEUED: "Queued", PROCESSING: "Processing", REVIEW: "Needs review", FAILED: "Failed", PUBLISHED: "Published", CANCELLED: "Cancelled" } as const;

export default async function AdminDocuments() {
  await failStaleExtractions();
  const docs = await db.uploadedDocument.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } }, routines: { select: { version: true, status: true } } },
    take: 300,
  });
  return (
    <div>
      <PageHeader
        title="Uploaded documents"
        subtitle="Originals are stored unchanged. Archive hides a document from teachers; an archived document can then be deleted for good."
        actions={<><Link href="/admin/storage" className="btn btn-secondary">Storage & clean-up</Link><Link href="/admin/upload" className="btn btn-primary">Upload new</Link></>}
      />
      {docs.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr>
                {["Document", "Type", "Status", "Uploaded", "By", ""].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className={d.archived ? "opacity-60" : ""}>
                  <td className="td">
                    <p className="font-semibold text-slate-900">{d.title}</p>
                    <p className="text-xs text-slate-500">{d.mimeType === GENERATED_MIME ? "Generated roster" : `${d.originalName} · ${formatBytes(d.sizeBytes)}${d.ocrUsed ? " · OCR" : ""}`}</p>
                    {d.routines[0] && <p className="text-xs text-slate-500">Routine v{d.routines[0].version} ({d.routines[0].status.toLowerCase()})</p>}
                  </td>
                  <td className="td">{d.kind}</td>
                  <td className="td">
                    <Pill tone={tone[d.extractionStatus]}>{label[d.extractionStatus]}</Pill>
                    {d.archived && <span className="ml-1"><Pill>Archived</Pill></span>}
                  </td>
                  <td className="td whitespace-nowrap">{formatDateShort(isoFromDate(d.createdAt))}</td>
                  <td className="td">{d.uploadedBy?.name ?? "—"}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-2">
                      {["REVIEW", "PROCESSING", "QUEUED", "FAILED", "PUBLISHED"].includes(d.extractionStatus) && (d.mimeType === GENERATED_MIME || (d.kind !== "NOTICE" && d.kind !== "OTHER")) && (
                        <Link href={`/admin/review/${d.id}`} className={`btn btn-sm ${d.extractionStatus === "REVIEW" ? "btn-primary" : "btn-secondary"}`}>
                          {d.extractionStatus === "REVIEW" ? "Review" : "Open"}
                        </Link>
                      )}
                      {d.mimeType !== GENERATED_MIME && (
                        <>
                          <a className="btn btn-secondary btn-sm" href={`/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer">View</a>
                          <a className="btn btn-secondary btn-sm" href={`/api/documents/${d.id}/file?download=1`}>Download</a>
                        </>
                      )}
                      {d.archived ? (
                        <>
                          <ActionButton label="Restore" url={`/api/documents/${d.id}`} method="PATCH" json={{ archived: false }} />
                          <ActionButton label="Delete" variant="danger" url={`/api/documents/${d.id}?permanent=1`} method="DELETE" confirm="Delete this document and its stored file permanently? This cannot be undone." />
                        </>
                      ) : (
                        <ActionButton label="Archive" url={`/api/documents/${d.id}`} method="DELETE" confirm="Hide this document from teachers? The original file is kept." />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No documents uploaded yet.</Empty>
      )}
    </div>
  );
}
