import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { HttpError, parseJson, requireUser, route } from "@/lib/security/api";
import { clear, record, tooMany } from "@/lib/security/rate-limit";
import { passwordChange } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  const me = await requireUser();
  const key = `pw:${me.id}`;
  if (tooMany(key, 5, 15 * 60_000)) throw new HttpError(429, "Too many attempts. Try again later.");
  const input = await parseJson(req, passwordChange);
  const user = await db.user.findUnique({ where: { id: me.id } });
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    record(key);
    throw new HttpError(403, "Current password is incorrect.");
  }
  if (input.currentPassword === input.newPassword) throw new HttpError(422, "Choose a different password.");
  clear(key);
  await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(input.newPassword, 12), mustChangePassword: false },
  });
  return { ok: true, message: "Password changed. Please sign in again." };
});
