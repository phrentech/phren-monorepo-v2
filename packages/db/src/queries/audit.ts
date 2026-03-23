import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { auditLogs } from '../schema';
import { generateUlid } from '@phren/core';
import type { AuditAction } from '@phren/core';

export async function logEvent(
  db: Database,
  event: {
    actorId: string;
    actorRole: string;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    detail?: string;
    ipAddress: string;
    outcome: 'success' | 'denied';
  },
) {
  await db.insert(auditLogs).values({
    id: generateUlid(),
    timestamp: new Date().toISOString(),
    ...event,
    detail: event.detail ?? null,
  });
}

export async function queryByDateRange(
  db: Database,
  from: string,
  to: string,
  options?: { actorId?: string; action?: string; limit?: number },
) {
  const conditions = [gte(auditLogs.timestamp, from), lte(auditLogs.timestamp, to)];
  if (options?.actorId) conditions.push(eq(auditLogs.actorId, options.actorId));
  if (options?.action) conditions.push(eq(auditLogs.action, options.action));
  return db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.timestamp))
    .limit(options?.limit ?? 1000);
}

export async function countByActor(db: Database, actorId: string, since: string) {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(eq(auditLogs.actorId, actorId), gte(auditLogs.timestamp, since)));
  return result[0]?.count ?? 0;
}
