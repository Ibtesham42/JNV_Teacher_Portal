import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";
import { accountInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Create a teacher's login, or reset its password. */
export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const input = await parseJson(req, accountInput);
  const teacher = await db.teacher.findUnique({ where: { id }, include: { user: true } });
  if (!teacher) throw new HttpError(404, "Teacher not found.");
  const passwordHash = await bcrypt.hash(input.password, 12);

  if (teacher.user) {
    const taken = await db.user.findFirst({ where: { username: input.username, NOT: { id: teacher.user.id } } });
    if (taken) throw new HttpError(409, "That username is already used.");
    await db.user.update({
      where: { id: teacher.user.id },
      data: { username: input.username, passwordHash, mustChangePassword: input.mustChangePassword, active: teacher.active },
    });
    await logActivity(admin, { action: "teacher.password_reset", entityType: "Teacher", entityId: id, summary: `Reset the login password for "${teacher.name}".` });
    return { ok: true, message: "Password reset." };
  }
  const taken = await db.user.findUnique({ where: { username: input.username } });
  if (taken) throw new HttpError(409, "That username is already used.");
  await db.user.create({
    data: {
      username: input.username,
      name: teacher.name,
      passwordHash,
      role: "TEACHER",
      teacherId: teacher.id,
      mustChangePassword: input.mustChangePassword,
    },
  });
  await logActivity(admin, { action: "teacher.login_created", entityType: "Teacher", entityId: id, summary: `Created a login ("${input.username}") for "${teacher.name}".` });
  return { ok: true, message: "Login created." };
});
