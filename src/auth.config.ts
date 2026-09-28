import type { NextAuthConfig } from "next-auth";

/** Edge-safe part of the Auth.js configuration (used by the middleware). */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.uid = u.id;
        token.role = u.role;
        token.username = u.username;
        token.teacherId = u.teacherId ?? null;
        token.mustChangePassword = !!u.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as "ADMIN" | "TEACHER";
        session.user.username = token.username as string;
        session.user.teacherId = (token.teacherId as string | null) ?? null;
        session.user.mustChangePassword = !!token.mustChangePassword;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
