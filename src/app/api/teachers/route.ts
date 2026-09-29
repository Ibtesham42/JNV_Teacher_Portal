import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { parseJson, requireAdmin, requireUser, route } from "@/lib/security/api";
import { teacherInput } from "@/lib/validation";

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const includeInactive = user.role === "ADMIN" && req.nextUrl.searchParams.get("all") === "1";
  const teachers = await db.teacher.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    select: {
      id: true, name: true, code: true, designation: true, active: true,
      ...(user.role === "ADMIN" ? { phone: true, aliases: true, user: { select: { username: true, active: true } } } : {}),
    },
    orderBy: { name: "asc" },
    take: q ? 15 : 500,
  });
  return { teachers };
});

export const POST = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const data = await parseJson(req, teacherInput);
  const teacher = await db.teacher.create({ data });
  await logActivity(admin, { action: "teacher.create", entityType: "Teacher", entityId: teacher.id, summary: `Added teacher "${teacher.name}".`, newValue: teacher });
  return { teacher };
});
