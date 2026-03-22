import type { AuditAction } from '@phren/core';

export type { AuditAction };

export interface AuditEvent {
  actorId: string;
  actorRole: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detail?: string;    // NEVER include PHI here
  ipAddress: string;
  outcome: 'success' | 'denied';
}
