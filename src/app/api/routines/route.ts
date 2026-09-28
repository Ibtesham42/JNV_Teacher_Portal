import { db } from "@/lib/db";
import { activateDueRoutines } from "@/lib/routineSchedule";
import { requireUser, route } from "@/lib/security/api";

export const GET = route(async () => {
  const user = await requireUser();
  await activateDueRoutines();
  const routines = await db.routine.findMany({
    where: user.role === "ADMIN" ? {} : { status: "ACTIVE" },
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, title: true, session: true, status: true, publishedAt: true, effectiveFrom: true, documentId: true,
      uploadedBy: { select: { name: true } },
      _count: { select: { periods: true } },
    },
  });
  return { routines };
});
