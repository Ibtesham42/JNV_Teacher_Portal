import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { draftDataSchema } from "@/lib/extraction/schema";
import { publishDraft } from "@/lib/extraction/publish";
import { HttpError, requireAdmin, route } from "@/lib/security/api";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  data: draftDataSchema.optional(),
  /** first day teachers see the routine (YYYY-MM-DD); a future date schedules it */
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** PUBLISH - saves the latest edits, then makes the routine live for everyone. */
export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(422, "The edited data is not valid.");
  if (parsed.data.data) {
    const draft = await db.extractionDraft.findUnique({ where: { documentId: id } });
    if (draft?.status === "REVIEW") {
      await db.extractionDraft.update({ where: { documentId: id }, data: { data: parsed.data.data as unknown as Prisma.InputJsonValue } });
    }
  }
  const result = await publishDraft(id, admin.id, { effectiveFrom: parsed.data.effectiveFrom });
  const message = result.scheduledFor ? `Routine scheduled. It replaces the current one on ${result.scheduledFor}.` : "Routine published successfully.";
  return { ok: true, message, ...result };
});
