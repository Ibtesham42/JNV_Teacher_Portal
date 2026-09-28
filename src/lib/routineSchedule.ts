import { db } from "./db";
import { dateFromISO, todayISO } from "./time";

/**
 * A routine published with a future "effective from" date waits as SCHEDULED. The first time anyone
 * asks for the current routine on or after that date, it takes over and the old one is archived.
 * Runs on read, so no cron job is needed.
 */
export async function activateDueRoutines(): Promise<void> {
  const today = dateFromISO(todayISO());
  const due = await db.routine.findMany({
    where: { status: "SCHEDULED", effectiveFrom: { lte: today } },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    select: { id: true },
  });
  if (!due.length) return;
  const [winner, ...rest] = due;
  await db.$transaction([
    db.routine.updateMany({
      where: { OR: [{ status: "ACTIVE" }, { id: { in: rest.map((r) => r.id) } }] },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    }),
    db.routine.update({ where: { id: winner.id }, data: { status: "ACTIVE", archivedAt: null } }),
  ]);
}

/** The next routine that is waiting for its start date (shown to teachers as "coming soon"). */
export async function getUpcomingRoutine() {
  return db.routine.findFirst({
    where: { status: "SCHEDULED" },
    orderBy: [{ effectiveFrom: "asc" }, { version: "asc" }],
    select: { id: true, version: true, title: true, effectiveFrom: true },
  });
}
