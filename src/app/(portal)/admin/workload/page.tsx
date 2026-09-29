import type { Metadata } from "next";
import { Empty, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { mergeTimeline, sumGapMinutes } from "@/lib/common";
import { getActiveRoutine, getAllPeriods } from "@/lib/queries";
import { WEEKDAYS } from "@/lib/time";
import WorkloadTable from "./WorkloadTable";

export const metadata: Metadata = { title: "Teacher workload" };
export const dynamic = "force-dynamic";

function formatMinutes(m: number): string {
  if (m <= 0) return "-";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h ? `${h}h ${rem ? `${rem}m` : ""}`.trim() : `${rem}m`;
}

export default async function WorkloadPage() {
  const routine = await getActiveRoutine();
  const [teachers, modCounts] = await Promise.all([
    db.teacher.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.modDuty.groupBy({ by: ["teacherId"], where: { dutyType: "MOD" }, _count: { _all: true } }),
  ]);

  if (!routine) {
    return (
      <div>
        <PageHeader title="Teacher workload" subtitle="Factual counts from the published routine - no judgement, just numbers." />
        <Empty title="No routine published yet">Workload figures need a published routine.</Empty>
      </div>
    );
  }

  const [periods, remedial] = await Promise.all([
    getAllPeriods(routine.id),
    db.remedialSchedule.findMany({ where: { active: true, teacherId: { in: teachers.map((t) => t.id) } }, select: { id: true, teacherId: true, day: true, activity: true, startTime: true, endTime: true } }),
  ]);
  const modByTeacher = new Map(modCounts.map((m) => [m.teacherId, m._count._all]));

  const rows = teachers.map((t) => {
    const mine = periods.filter((p) => p.teacherId === t.id && !p.isBreak);
    const classes = new Set(mine.map((p) => `${p.className}|${p.section}`));
    const myRemedial = remedial.filter((r) => r.teacherId === t.id);

    let freeMinutes = 0;
    for (const day of WEEKDAYS) {
      const dayPeriods = mine.filter((p) => p.day === day);
      const dayRemedial = myRemedial.filter((r) => r.day === day);
      if (!dayPeriods.length) continue;
      freeMinutes += sumGapMinutes(mergeTimeline(dayPeriods, dayRemedial));
    }

    return {
      id: t.id,
      name: t.name,
      designation: t.designation,
      periodsPerWeek: mine.length,
      classes: classes.size,
      modDuties: modByTeacher.get(t.id) ?? 0,
      freeTimePerWeek: formatMinutes(freeMinutes),
    };
  });

  return (
    <div>
      <PageHeader
        title="Teacher workload"
        subtitle={`From the active routine (v${routine.version}) - factual counts only, no ranking or labels.`}
      />
      <WorkloadTable rows={rows} />
    </div>
  );
}
