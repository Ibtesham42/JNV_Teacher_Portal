import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getClubs } from "@/lib/queries";
import { parseJson, requireAdmin, requireUser, route } from "@/lib/security/api";
import { clubInput } from "@/lib/validation";

export const GET = route(async () => {
  await requireUser();
  return { clubs: await getClubs() };
});

export const POST = route(async (req: NextRequest) => {
  await requireAdmin();
  const input = await parseJson(req, clubInput);
  const club = await db.clubActivity.create({ data: { ...input, active: true } });
  return { club };
});
