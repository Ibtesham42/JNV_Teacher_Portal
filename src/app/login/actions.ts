"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function authenticate(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const next = String(formData.get("next") || "");
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
  try {
    await signIn("credentials", {
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || ""),
      redirectTo: safeNext,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      if ((e as any).code === "too_many_attempts") return "Too many failed attempts. Please wait 15 minutes and try again.";
      return "Incorrect username or password.";
    }
    throw e; // the redirect after a successful sign-in
  }
}
