import { db } from "./db";
import type { SessionUser } from "./security/api";

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  oldValue?: unknown;
  newValue?: unknown;
};

/** Records an admin action for /admin/activity. Never throws - a logging failure must not block the real change. */
export async function logActivity(actor: SessionUser, entry: AuditEntry): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as any),
        newValue: entry.newValue === undefined ? undefined : (entry.newValue as any),
      },
    });
  } catch (e) {
    console.error("[audit] failed to record activity", entry.action, e);
  }
}
