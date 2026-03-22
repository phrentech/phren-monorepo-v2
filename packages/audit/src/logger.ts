import { generateUlid } from '@phren/core';
import type { Database } from '@phren/db';
import { auditLogs } from '@phren/db';
import type { AuditEvent } from './types';

export async function logAuditEvent(db: Database, event: AuditEvent): Promise<void> {
  await db.insert(auditLogs).values({
    id: generateUlid(),
    timestamp: new Date().toISOString(),
    actorId: event.actorId,
    actorRole: event.actorRole,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    detail: event.detail ?? null,
    ipAddress: event.ipAddress,
    outcome: event.outcome,
  });
}
