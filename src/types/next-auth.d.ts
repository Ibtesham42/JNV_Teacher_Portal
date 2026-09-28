import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "TEACHER";
      username: string;
      teacherId: string | null;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}
