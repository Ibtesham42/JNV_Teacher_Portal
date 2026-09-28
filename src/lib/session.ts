import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "./security/api";

export async function pageUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function adminPageUser(): Promise<SessionUser> {
  const u = await pageUser();
  if (u.role !== "ADMIN") redirect("/");
  return u;
}
