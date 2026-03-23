import { createMiddleware } from 'hono/factory';
import type { Env } from '../env';
import type { AppVariables } from './auth';
import { logAuditEvent } from '@phren/audit';
import type { UserRole } from '@phren/core';

export function requireRole(...roles: UserRole[]) {
  return createMiddleware<{ Bindings: Env; Variables: AppVariables }>(async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      const db = c.get('db');
      if (user) {
        await logAuditEvent(db, {
          actorId: user.id,
          actorRole: user.role,
          action: 'record.read',
          resourceType: 'route',
          resourceId: c.req.path,
          ipAddress: c.req.header('CF-Connecting-IP') || 'unknown',
          outcome: 'denied',
        });
      }
      return c.json({ error: 'Insufficient permissions' }, 403);
    }
    await next();
  });
}
