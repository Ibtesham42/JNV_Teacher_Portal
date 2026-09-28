import { NextRequest } from "next/server";
import { globalSearch } from "@/lib/search";
import { parseQuery, requireUser, route } from "@/lib/security/api";
import { searchQuery } from "@/lib/validation";

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  const { q } = parseQuery(req, searchQuery);
  return globalSearch(q, user.role === "ADMIN");
});
