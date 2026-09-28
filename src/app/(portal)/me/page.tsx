import type { Metadata } from "next";
import Link from "next/link";
import TeacherSchedule from "@/components/TeacherSchedule";
import TeacherSearch from "@/components/TeacherSearch";
import { Empty } from "@/components/ui";
import { pageUser } from "@/lib/session";

export const metadata: Metadata = { title: "My Dashboard" };
export const dynamic = "force-dynamic";

export default async function MyDashboard() {
  const user = await pageUser();
  if (!user.teacherId) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Empty title={`Welcome, ${user.name}`}>
          {user.role === "ADMIN"
            ? "Your account is not linked to a teacher record. Search a teacher below, or open the admin dashboard."
            : "Your login is not linked to a teacher record yet. Please ask the administrator."}
        </Empty>
        <TeacherSearch big autoFocus />
        {user.role === "ADMIN" && (
          <Link href="/admin" className="btn btn-primary">Go to Admin Dashboard</Link>
        )}
      </div>
    );
  }
  return <TeacherSchedule teacherId={user.teacherId} self userName={user.name} />;
}
