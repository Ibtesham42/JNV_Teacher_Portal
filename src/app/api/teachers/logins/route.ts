import { requireAdmin, route } from "@/lib/security/api";
import { createLoginsForAllTeachers } from "@/lib/teacherLogins";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Create logins for every teacher who has none. The passwords are returned once and never stored in plain text. */
export const POST = route(async () => {
  await requireAdmin();
  return createLoginsForAllTeachers();
});
