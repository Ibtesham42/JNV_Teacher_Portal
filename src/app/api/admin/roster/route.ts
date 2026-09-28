import { NextRequest } from "next/server";
import { HttpError, requireAdmin, route } from "@/lib/security/api";
import { createRosterDraft, rosterParams } from "@/lib/roster/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Generates a roster draft (admin only). It goes to the normal review screen; nothing is published. */
export const POST = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const parsed = rosterParams.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(422, parsed.error.issues[0]?.message ?? "The settings are not valid.");
  const r = await createRosterDraft(parsed.data, admin.id);
  return { ok: true, ...r };
});
