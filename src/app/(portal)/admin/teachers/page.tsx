import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import TeachersManager from "./TeachersManager";
import LoginsPanel from "./LoginsPanel";
import TidyPanel from "./TidyPanel";
import { parseTeacherText } from "@/lib/teacherIdentity";

export const metadata: Metadata = { title: "Manage teachers" };
export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const teachers = await db.teacher.findMany({
    orderBy: { name: "asc" },
    include: { user: { select: { username: true, active: true } }, weeklyOffs: { select: { day: true } } },
  });
  return (
    <div>
      <PageHeader title="Manage teachers" subtitle="The teacher list is used to match names found in uploaded documents. Teachers are never created automatically." />
      <div className="mb-6 space-y-6">
        <LoginsPanel missing={teachers.filter((t) => t.active && !t.user && parseTeacherText(t.name).kind === "person").length} />
        <TidyPanel />
      </div>
      <TeachersManager
        teachers={teachers.map((t) => ({
          id: t.id,
          name: t.name,
          code: t.code,
          designation: t.designation,
          phone: t.phone,
          aliases: t.aliases,
          active: t.active,
          username: t.user?.username ?? null,
        }))}
      />
    </div>
  );
}
