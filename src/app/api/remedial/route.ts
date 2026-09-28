import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { normalizeClassName, normalizeSection } from "@/lib/extraction/normalize";
import { getRemedial } from "@/lib/queries";
import { HttpError, parseJson, requireAdmin, requireUser, route } from "@/lib/security/api";
import { remedialInput } from "@/lib/validation";

export const GET = route(async () => {
  await requireUser();
  return { schedule: await getRemedial() };
});

export const POST = route(async (req: NextRequest) => {
  await requireAdmin();
  const input = await parseJson(req, remedialInput);
  const className = normalizeClassName(input.className);
  if (!className) throw new HttpError(422, "Invalid class.");
  let teacherName = "";
  if (input.teacherId) {
    const t = await db.teacher.findUnique({ where: { id: input.teacherId } });
    if (!t) throw new HttpError(422, "Teacher not found.");
    teacherName = t.name;
  }
  const row = await db.remedialSchedule.create({
    data: { ...input, className, section: normalizeSection(input.section), teacherName, active: true },
  });
  return { row };
});
