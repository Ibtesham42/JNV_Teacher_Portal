import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { storeDocument } from "@/lib/documents";
import { HttpError, requireAdmin, requireUser, route } from "@/lib/security/api";
import { UploadError } from "@/lib/security/files";
import { isoFromDate } from "@/lib/time";
import { noticeInput } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireUser();
  const notices = await db.notice.findMany({
    where: user.role === "ADMIN" ? {} : { archived: false },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return { notices: notices.map((n) => ({ ...n, date: isoFromDate(n.date) })) };
});

/** multipart/form-data: title, description, date, priority, optional file (attachment) */
export const POST = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Invalid form.");
  const parsed = noticeInput.safeParse({
    title: form.get("title"),
    description: form.get("description"),
    date: form.get("date"),
    priority: form.get("priority") || "NORMAL",
  });
  if (!parsed.success) throw new HttpError(422, "Please check the notice details.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));

  let documentId: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      const doc = await storeDocument({ file, kind: "NOTICE", title: parsed.data.title, userId: admin.id, extract: false });
      documentId = doc.id;
    } catch (e) {
      if (e instanceof UploadError) throw new HttpError(422, e.message);
      throw e;
    }
  }
  const notice = await db.notice.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      priority: parsed.data.priority,
      documentId,
      createdById: admin.id,
    },
  });
  await logActivity(admin, { action: "notice.create", entityType: "Notice", entityId: notice.id, summary: `Posted notice "${notice.title}".`, newValue: notice });
  return { notice: { ...notice, date: isoFromDate(notice.date) } };
});
