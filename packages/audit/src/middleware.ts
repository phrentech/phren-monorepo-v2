import type { Context, Next } from 'hono';
import { logAuditEvent } from './logger';

export function auditMiddleware(action: string, resourceType: string) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';

    await next();

    if (user) {
      await logAuditEvent(c.get('db'), {
        actorId: user.id,
        actorRole: user.role,
        action: action as any,
        resourceType,
        resourceId: c.req.param('id') || 'unknown',
        ipAddress: ip,
        outcome: c.res.status < 400 ? 'success' : 'denied',
      });
    }
  };
}
