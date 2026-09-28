import type { Metadata } from "next";
import TeacherSchedule from "@/components/TeacherSchedule";
import TeacherSearch from "@/components/TeacherSearch";

export const metadata: Metadata = { title: "Teacher" };
export const dynamic = "force-dynamic";

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-5">
      <div className="max-w-xl">
        <TeacherSearch placeholder="Search another teacher..." />
      </div>
      <TeacherSchedule teacherId={id} />
    </div>
  );
}
