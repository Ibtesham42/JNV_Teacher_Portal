import NavTabs from "@/components/NavTabs";
import { PageHeader } from "@/components/ui";
import { getActiveRoutine } from "@/lib/queries";
import { getUpcomingRoutine } from "@/lib/routineSchedule";
import { formatDateShort, isoFromDate } from "@/lib/time";

export default async function RoutineLayout({ children }: { children: React.ReactNode }) {
  const routine = await getActiveRoutine();
  const upcoming = await getUpcomingRoutine();
  return (
    <div>
      <PageHeader
        title="Routine"
        subtitle={
          routine
            ? `${routine.title}${routine.session ? ` · Session ${routine.session}` : ""} · Version ${routine.version} · effective ${formatDateShort(isoFromDate(routine.effectiveFrom))}`
            : "No routine has been published yet."
        }
        actions={
          routine?.document ? (
            <>
              <a className="btn btn-secondary btn-sm" href={`/api/documents/${routine.document.id}/file`} target="_blank" rel="noopener noreferrer">View original</a>
              <a className="btn btn-secondary btn-sm" href={`/api/documents/${routine.document.id}/file?download=1`}>Download</a>
            </>
          ) : undefined
        }
      />
      {upcoming && (
        <p className="mb-4 rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-900 ring-1 ring-brand-100">
          A new routine ({upcoming.title}) starts on <b>{formatDateShort(isoFromDate(upcoming.effectiveFrom))}</b>. It will appear here automatically.
        </p>
      )}
      <NavTabs
        items={[
          { href: "/routine/class", label: "Class view", match: "/routine/class" },
          { href: "/routine/teacher", label: "Teacher view", match: "/routine/teacher" },
          { href: "/routine/today", label: "Today", match: "/routine/today" },
          { href: "/routine/complete", label: "Complete routine", match: "/routine/complete" },
        ]}
      />
      {children}
    </div>
  );
}
