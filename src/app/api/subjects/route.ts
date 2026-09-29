import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { HttpError, parseJson, requireAdmin, requireUser, route } from "@/lib/security/api";
import { subjectInput } from "@/lib/validation";

export const GET = route(async () => {
  await requireUser();
  const subjects = await db.subject.findMany({ orderBy: { name: "asc" } });
  return { subjects };
});

export const POST = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const input = await parseJson(req, subjectInput);
  const existing = await db.subject.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
  if (existing) throw new HttpError(409, "That subject already exists.");
  const subject = await db.subject.create({ data: { name: input.name } });
  await logActivity(admin, { action: "subject.create", entityType: "Subject", entityId: subject.id, summary: `Added subject "${subject.name}".`, newValue: subject });
  return { subject };
});
