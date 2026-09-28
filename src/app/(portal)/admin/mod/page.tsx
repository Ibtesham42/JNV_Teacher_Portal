import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { dateFromISO, isoFromDate, todayISO } from "@/lib/time";
import ModManager from "./ModManager";

export const metadata: Metadata = { title: "Manage MOD" };
export const dynamic = "force-dynamic";

export default async function AdminMod() {
  const today = todayISO();
  const from = new Date(dateFromISO(today).getTime() - 14 * 86400000);
  const [teachers, duties] = await Promise.all([
    db.teacher.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.modDuty.findMany({ where: { date: { gte: from } }, orderBy: [{ date: "asc" }, { teacherName: "asc" }], take: 500 }),
  ]);
  return (
    <div>
      <PageHeader title="Manage MOD duty" subtitle="Assign one or more teachers as MOD for a date or a range of dates. MOD is never guessed." />
      <ModManager
        today={today}
        teachers={teachers}
        duties={duties.map((d) => ({ id: d.id, date: isoFromDate(d.date), day: d.day, teacherName: d.teacherName, description: d.dutyDescription, dutyType: d.dutyType }))}
      />
    </div>
  );
}
