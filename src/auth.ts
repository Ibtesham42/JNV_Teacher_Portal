import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { clear, record, tooMany } from "./lib/security/rate-limit";

class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

// verified against when the user does not exist, so timing does not reveal valid usernames
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const username = parsed.data.username.toLowerCase();
        const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        const userKey = `login:u:${username}`;
        const ipKey = `login:ip:${ip}`;
        if (tooMany(userKey, 6, 15 * 60_000) || tooMany(ipKey, 40, 15 * 60_000)) throw new TooManyAttempts();

        const user = await db.user.findUnique({ where: { username } });
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.active || !ok) {
          record(userKey);
          record(ipKey);
          return null;
        }
        clear(userKey);
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          teacherId: user.teacherId,
          mustChangePassword: user.mustChangePassword,
        } as any;
      },
    }),
  ],
});
