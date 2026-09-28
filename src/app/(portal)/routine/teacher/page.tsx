import type { Metadata } from "next";
import Link from "next/link";
import TeacherSearch from "@/components/TeacherSearch";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Teacher routine" };
export const dynamic = "force-dynamic";

export default async function TeacherView() {
  const teachers = await db.teacher.findMany({ where: { active: true }, select: { id: true, name: true, designation: true, code: true }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-5">
      <div className="card card-pad max-w-2xl">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Search Teacher</h2>
        <TeacherSearch big autoFocus placeholder="Type a teacher's name..." />
        <p className="mt-2 text-xs text-slate-500">Opens the teacher&apos;s daily and weekly timetable, MOD duty and weekly off.</p>
      </div>
      <div>
        <p className="section-title mb-2">All teachers ({teachers.length})</p>
        {teachers.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((t) => (
              <li key={t.id}>
                <Link href={`/teachers/${t.id}`} className="card block px-4 py-3 transition hover:border-brand-400">
                  <span className="block font-semibold text-slate-900">{t.name}</span>
                  <span className="block text-xs text-slate-500">{[t.designation, t.code].filter(Boolean).join(" · ") || "Teacher"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No teachers yet. Information not available in uploaded document.</p>
        )}
      </div>
    </div>
  );
}
