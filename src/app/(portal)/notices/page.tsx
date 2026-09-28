import type { Metadata } from "next";
import { db } from "@/lib/db";
import { DocLinks, Empty, PageHeader, Pill } from "@/components/ui";
import { formatDateShort, isoFromDate } from "@/lib/time";

export const metadata: Metadata = { title: "Notices" };
export const dynamic = "force-dynamic";

const tone = { URGENT: "red", HIGH: "amber", NORMAL: "blue", LOW: "slate" } as const;

export default async function NoticesPage() {
  const notices = await db.notice.findMany({
    where: { archived: false },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { document: { select: { id: true, originalName: true, archived: true } } },
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Notices" />
      {notices.length ? (
        <ul className="space-y-3">
          {notices.map((n) => (
            <li key={n.id} className="card card-pad">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={tone[n.priority]}>{n.priority}</Pill>
                <span className="text-xs text-slate-500">{formatDateShort(isoFromDate(n.date))}</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-slate-900">{n.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.description}</p>
              {n.document && !n.document.archived && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">Attachment: {n.document.originalName}</span>
                  <DocLinks id={n.document.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No notices have been posted.</Empty>
      )}
    </div>
  );
}
