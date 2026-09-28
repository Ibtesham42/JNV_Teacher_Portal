import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import WeeklyOffManager from "./WeeklyOffManager";

export const metadata: Metadata = { title: "Manage weekly off" };
export const dynamic = "force-dynamic";

export default async function AdminWeeklyOff() {
  const teachers = await db.teacher.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, weeklyOffs: { select: { day: true } } },
  });
  return (
    <div>
      <PageHeader title="Manage weekly off" subtitle="Choose each teacher's weekly off day. Leave blank if it is not known - nothing is guessed." />
      <WeeklyOffManager teachers={teachers.map((t) => ({ id: t.id, name: t.name, day: t.weeklyOffs[0]?.day ?? null }))} />
    </div>
  );
}
