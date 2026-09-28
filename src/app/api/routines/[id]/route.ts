import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { dateFromISO, todayISO } from "@/lib/time";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";

type Ctx = { params: Promise<{ id: string }> };

const action = z.object({ action: z.enum(["activate", "archive"]) });

/** activate = roll back / switch to this version; archive = deactivate without deleting. */
export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const { action: act } = await parseJson(req, action);
  const routine = await db.routine.findUnique({ where: { id } });
  if (!routine) throw new HttpError(404, "Routine not found.");
  if (act === "activate") {
    await db.$transaction([
      db.routine.updateMany({ where: { status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: new Date() } }),
      db.routine.update({ where: { id }, data: { status: "ACTIVE", archivedAt: null, effectiveFrom: dateFromISO(todayISO()) } }),
    ]);
  } else {
    await db.routine.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  }
  return { ok: true };
});

/** Remove an old version's timetable data. The original document stays in Official Documents. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const routine = await db.routine.findUnique({ where: { id } });
  if (!routine) throw new HttpError(404, "Routine not found.");
  if (routine.status === "ACTIVE") throw new HttpError(409, "The active routine cannot be deleted. Activate another version first.");
  await db.routine.delete({ where: { id } });
  return { ok: true };
});
