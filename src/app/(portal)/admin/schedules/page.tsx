import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { getClubs, getRemedial } from "@/lib/queries";
import SchedulesManager from "./SchedulesManager";

export const metadata: Metadata = { title: "Clubs & remedial" };
export const dynamic = "force-dynamic";

export default async function AdminSchedules() {
  const [clubs, remedial, teachers] = await Promise.all([
    getClubs(),
    getRemedial(),
    db.teacher.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Clubs & remedial / enrichment"
        subtitle="Upload a document to extract them automatically, or edit the published entries here."
        actions={
          <>
            <Link href="/admin/upload?kind=REMEDIAL" className="btn btn-secondary">Upload schedule</Link>
            <Link href="/admin/upload?kind=CLUB" className="btn btn-secondary">Upload club document</Link>
          </>
        }
      />
      <SchedulesManager
        classes={[...config.classes]}
        sections={[...config.sections]}
        teachers={teachers}
        clubs={clubs.map((c) => ({ id: c.id, name: c.name, members: c.members, activities: c.activities }))}
        remedial={remedial.map((r) => ({ id: r.id, category: r.category, className: r.className, section: r.section, day: r.day, startTime: r.startTime, endTime: r.endTime, activity: r.activity, teacherName: r.teacherName }))}
      />
    </div>
  );
}
