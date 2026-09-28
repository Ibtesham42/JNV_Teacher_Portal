import { db } from "./db";
import { storage } from "./storage";
import { dateFromISO, todayISO } from "./time";

/** Free Neon databases hold 0.5 GB; override with DB_LIMIT_MB for a paid plan. */
export const DB_LIMIT_BYTES = Math.max(50, Number(process.env.DB_LIMIT_MB || 512)) * 1024 * 1024;

export const RETENTION_CHOICES = [3, 6, 12, 24] as const;

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

// ------------------------------------------------------------------ usage report

export type StorageReport = {
  usedBytes: number;
  limitBytes: number;
  tables: { name: string; bytes: number }[];
  fileCount: number;
  fileBytes: number;
};

const TABLE_LABELS: Record<string, string> = {
  StoredFile: "Uploaded original files",
  ExtractionDraft: "Extraction drafts and OCR text",
  ExtractionLog: "Extraction logs",
  RoutinePeriod: "Routine periods",
  RoutineClass: "Routine classes",
  Routine: "Routine versions",
  MODDuty: "MOD / holiday duty",
  UploadedDocument: "Document records",
  Teacher: "Teachers",
  User: "Logins",
  Notice: "Notices",
  WeeklyOff: "Weekly off",
  RemedialSchedule: "Remedial / enrichment",
  ClubActivity: "Clubs",
  Subject: "Subjects",
  SchoolDay: "School days",
};

export async function getStorageReport(): Promise<StorageReport> {
  const [size, tables, files] = await Promise.all([
    db.$queryRaw<{ n: bigint }[]>`SELECT pg_database_size(current_database()) AS n`,
    db.$queryRaw<{ name: string; bytes: bigint }[]>`
      SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname = 'public' AND c.relname NOT LIKE '%prisma%'
      ORDER BY bytes DESC`,
    db.uploadedDocument.aggregate({ _count: true, _sum: { sizeBytes: true } }),
  ]);
  return {
    usedBytes: Number(size[0]?.n ?? 0),
    limitBytes: DB_LIMIT_BYTES,
    tables: tables.filter((t) => Number(t.bytes) > 0).slice(0, 8).map((t) => ({ name: TABLE_LABELS[t.name] ?? t.name, bytes: Number(t.bytes) })),
    fileCount: files._count,
    fileBytes: files._sum.sizeBytes ?? 0,
  };
}

// ------------------------------------------------------------------ documents

export type DocReason = "ARCHIVED" | "JUNK" | "SUPERSEDED" | "OLD";

export type DocCandidate = {
  id: string;
  title: string;
  originalName: string;
  kind: string;
  sizeBytes: number;
  createdAt: string;
  reason: DocReason;
  reasonText: string;
  preselect: boolean;
};

const docInclude = {
  routines: { select: { status: true } },
  remedials: { where: { active: true }, select: { id: true }, take: 1 },
  clubs: { where: { active: true }, select: { id: true }, take: 1 },
  notices: { where: { archived: false }, select: { id: true }, take: 1 },
  _count: { select: { remedials: true, clubs: true } },
} as const;

type DocRow = Awaited<ReturnType<typeof loadDocs>>[number];

function loadDocs(where: object = {}) {
  return db.uploadedDocument.findMany({ where, include: docInclude, orderBy: { createdAt: "asc" } });
}

/** Why a document must NOT be deleted (null = safe to delete). */
export function blockReason(d: DocRow): string | null {
  if (["QUEUED", "PROCESSING", "REVIEW"].includes(d.extractionStatus)) return "It is still being processed or waiting for review.";
  if (d.routines.some((r) => r.status === "ACTIVE" || r.status === "SCHEDULED")) return "It is the current or an upcoming routine.";
  if (d.remedials.length || d.clubs.length) return "Its schedule / club list is still live.";
  if (d.notices.length && !d.archived) return "A notice that teachers can see uses it as an attachment.";
  return null;
}

export async function planDocuments(months: number): Promise<{ candidates: DocCandidate[]; totalBytes: number }> {
  const cutoff = monthsAgo(months);
  const dayAgo = monthsAgo(0);
  dayAgo.setDate(dayAgo.getDate() - 1);
  const docs = await loadDocs();
  const out: DocCandidate[] = [];
  for (const d of docs) {
    if (blockReason(d)) continue;
    let reason: DocReason | null = null;
    let text = "";
    let preselect = true;
    const old = d.createdAt < cutoff;
    if (d.archived) {
      reason = "ARCHIVED";
      text = "Archived (hidden from teachers)";
    } else if (d.extractionStatus === "CANCELLED" || (d.extractionStatus === "FAILED" && d.updatedAt < dayAgo)) {
      reason = "JUNK";
      text = d.extractionStatus === "CANCELLED" ? "Cancelled extraction" : "Extraction failed";
    } else if (old && d.kind === "ROUTINE" && d.routines.length > 0) {
      reason = "SUPERSEDED";
      text = "Replaced by a newer routine";
    } else if (old && (d.kind === "REMEDIAL" || d.kind === "CLUB") && (d._count.remedials + d._count.clubs) > 0) {
      reason = "SUPERSEDED";
      text = "Replaced by a newer schedule";
    } else if (old) {
      reason = "OLD";
      text = `Older than ${months} months`;
      preselect = false;
    }
    if (!reason) continue;
    out.push({
      id: d.id,
      title: d.title,
      originalName: d.originalName,
      kind: d.kind,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString().slice(0, 10),
      reason,
      reasonText: text,
      preselect,
    });
  }
  return { candidates: out, totalBytes: out.reduce((n, c) => n + c.sizeBytes, 0) };
}

/** Deletes documents (record, extraction draft, logs and the stored original). Documents that are in use are skipped. */
export async function deleteDocuments(ids: string[]): Promise<{ deleted: number; skipped: { id: string; title: string; why: string }[]; freedBytes: number }> {
  const docs = ids.length ? await loadDocs({ id: { in: ids } }) : [];
  const skipped: { id: string; title: string; why: string }[] = [];
  let deleted = 0;
  let freed = 0;
  for (const d of docs) {
    const why = blockReason(d);
    if (why) {
      skipped.push({ id: d.id, title: d.title, why });
      continue;
    }
    await db.uploadedDocument.delete({ where: { id: d.id } });
    await storage.remove(d.storageKey).catch(() => {}); // a leftover file is caught by the orphan clean-up
    deleted++;
    freed += d.sizeBytes;
  }
  return { deleted, skipped, freedBytes: freed };
}

// ------------------------------------------------------------------ data older than the retention period

export type DataPlan = {
  routines: { count: number; periods: number };
  duties: { count: number };
  notices: { count: number };
  draftText: { count: number; bytes: number };
  orphans: { count: number; bytes: number };
};

const KEEP_ARCHIVED_ROUTINES = 2; // newest archived versions stay, so an admin can still roll back

async function oldRoutineIds(months: number): Promise<string[]> {
  const cutoff = monthsAgo(months);
  const archived = await db.routine.findMany({
    where: { status: "ARCHIVED" },
    orderBy: { version: "desc" },
    select: { id: true, publishedAt: true, archivedAt: true },
  });
  return archived.slice(KEEP_ARCHIVED_ROUTINES).filter((r) => (r.archivedAt ?? r.publishedAt) < cutoff).map((r) => r.id);
}

function dutyCutoff(months: number): Date {
  const d = dateFromISO(todayISO());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export async function planData(months: number): Promise<DataPlan> {
  const routineIds = await oldRoutineIds(months);
  const [periods, duties, notices, draft, orphans] = await Promise.all([
    routineIds.length ? db.routinePeriod.count({ where: { routineId: { in: routineIds } } }) : 0,
    db.modDuty.count({ where: { date: { lt: dutyCutoff(months) } } }),
    db.notice.count({ where: { archived: true, date: { lt: monthsAgo(months) } } }),
    db.$queryRaw<{ n: bigint; bytes: bigint | null }[]>`
      SELECT count(*) AS n, COALESCE(sum(octet_length("rawText")), 0) AS bytes
      FROM "ExtractionDraft" WHERE "rawText" IS NOT NULL AND status IN ('PUBLISHED','CANCELLED','FAILED')`,
    db.$queryRaw<{ n: bigint; bytes: bigint | null }[]>`
      SELECT count(*) AS n, COALESCE(sum(octet_length(data)), 0) AS bytes FROM "StoredFile"
      WHERE key NOT IN (SELECT "storageKey" FROM "UploadedDocument")`,
  ]);
  return {
    routines: { count: routineIds.length, periods },
    duties: { count: duties },
    notices: { count: notices },
    draftText: { count: Number(draft[0]?.n ?? 0), bytes: Number(draft[0]?.bytes ?? 0) },
    orphans: { count: Number(orphans[0]?.n ?? 0), bytes: Number(orphans[0]?.bytes ?? 0) },
  };
}

export async function purgeRoutines(months: number): Promise<number> {
  const ids = await oldRoutineIds(months);
  if (!ids.length) return 0;
  await db.routine.deleteMany({ where: { id: { in: ids }, status: "ARCHIVED" } });
  return ids.length;
}

export async function purgeDuties(months: number): Promise<number> {
  return (await db.modDuty.deleteMany({ where: { date: { lt: dutyCutoff(months) } } })).count;
}

export async function purgeNotices(months: number): Promise<number> {
  return (await db.notice.deleteMany({ where: { archived: true, date: { lt: monthsAgo(months) } } })).count;
}

/** The raw OCR text is only a reference for the review screen; once published it can go. */
export async function trimDraftText(): Promise<number> {
  return db.$executeRaw`UPDATE "ExtractionDraft" SET "rawText" = NULL WHERE "rawText" IS NOT NULL AND status IN ('PUBLISHED','CANCELLED','FAILED')`;
}

export async function purgeOrphanFiles(): Promise<number> {
  return db.$executeRaw`DELETE FROM "StoredFile" WHERE key NOT IN (SELECT "storageKey" FROM "UploadedDocument")`;
}
