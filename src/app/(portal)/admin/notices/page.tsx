import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { isoFromDate, todayISO } from "@/lib/time";
import NoticesManager from "./NoticesManager";

export const metadata: Metadata = { title: "Manage notices" };
export const dynamic = "force-dynamic";

export default async function AdminNotices() {
  const notices = await db.notice.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { document: { select: { id: true, originalName: true } } },
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Manage notices" />
      <NoticesManager
        today={todayISO()}
        notices={notices.map((n) => ({
          id: n.id, title: n.title, description: n.description, date: isoFromDate(n.date), priority: n.priority, archived: n.archived,
          attachment: n.document ? { id: n.document.id, name: n.document.originalName } : null,
        }))}
      />
    </div>
  );
}
