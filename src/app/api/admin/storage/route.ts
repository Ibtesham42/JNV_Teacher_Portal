import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, parseJson, requireAdmin, route } from "@/lib/security/api";
import { deleteDocuments, purgeDuties, purgeNotices, purgeOrphanFiles, purgeRoutines, trimDraftText } from "@/lib/storageCleanup";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete-documents"), ids: z.array(z.string().max(40)).min(1).max(500) }),
  z.object({ action: z.literal("purge-routines"), months: z.number().int().min(1).max(120) }),
  z.object({ action: z.literal("purge-duties"), months: z.number().int().min(1).max(120) }),
  z.object({ action: z.literal("purge-notices"), months: z.number().int().min(1).max(120) }),
  z.object({ action: z.literal("trim-text") }),
  z.object({ action: z.literal("purge-orphans") }),
]);

/** Admin-only clean-up of data that is no longer used. Every action re-checks on the server what is safe to remove. */
export const POST = route(async (req: NextRequest) => {
  await requireAdmin();
  const b = await parseJson(req, body);
  switch (b.action) {
    case "delete-documents": {
      const r = await deleteDocuments(b.ids);
      if (!r.deleted && r.skipped.length) throw new HttpError(409, `Nothing deleted: ${r.skipped[0].title} - ${r.skipped[0].why}`);
      return { ok: true, message: `${r.deleted} document(s) deleted${r.skipped.length ? `, ${r.skipped.length} skipped because they are in use` : ""}.`, ...r };
    }
    case "purge-routines":
      return { ok: true, message: `${await purgeRoutines(b.months)} old routine version(s) deleted.` };
    case "purge-duties":
      return { ok: true, message: `${await purgeDuties(b.months)} old duty entries deleted.` };
    case "purge-notices":
      return { ok: true, message: `${await purgeNotices(b.months)} old archived notice(s) deleted.` };
    case "trim-text":
      return { ok: true, message: `Extraction text cleared for ${await trimDraftText()} document(s).` };
    case "purge-orphans":
      return { ok: true, message: `${await purgeOrphanFiles()} unattached file(s) deleted.` };
  }
});
