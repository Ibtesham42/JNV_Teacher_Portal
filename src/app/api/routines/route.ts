import { db } from "@/lib/db";
import { requireUser, route } from "@/lib/security/api";

export const GET = route(async () => {
  const user = await requireUser();
  const routines = await db.routine.findMany({
    where: user.role === "ADMIN" ? {} : { status: "ACTIVE" },
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, title: true, session: true, status: true, publishedAt: true, documentId: true,
      uploadedBy: { select: { name: true } },
      _count: { select: { periods: true } },
    },
  });
  return { routines };
});
