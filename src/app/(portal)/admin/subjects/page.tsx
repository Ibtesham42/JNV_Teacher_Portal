import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import SubjectsManager from "./SubjectsManager";

export const metadata: Metadata = { title: "Subjects" };
export const dynamic = "force-dynamic";

export default async function AdminSubjects() {
  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { periods: true } } },
  });
  return (
    <div>
      <PageHeader title="Subjects" subtitle="The subject list used across routines. New subjects are also created automatically when a routine is published." />
      <SubjectsManager subjects={subjects.map((s) => ({ id: s.id, name: s.name, periodCount: s._count.periods }))} />
    </div>
  );
}
