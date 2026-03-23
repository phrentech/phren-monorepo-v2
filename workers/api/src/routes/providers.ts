import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import type { AppVariables } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getProviderById, searchProviders, getProviderServices, providers } from '@phren/db';
import { createProviderSchema, createServiceSchema } from '@phren/core';
import { logAuditEvent } from '@phren/audit';

export const providerRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

providerRoutes.get('/search', async (c) => {
  const db = c.get('db');
  const specialization = c.req.query('specialization');
  const maxPrice = c.req.query('maxPrice');
  const results = await searchProviders(db, {
    specialization: specialization || undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
  });
  return c.json(results);
});

providerRoutes.get('/me', requireRole('provider'), async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const provider = await getProviderById(db, user.id);
  return c.json(provider);
});

providerRoutes.put('/me', requireRole('provider'), async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const validated = createProviderSchema.parse(body);

  await db
    .update(providers)
    .set({
      bio: validated.bio,
      specialization: validated.specialization,
      yearsExperience: validated.yearsExperience,
      hourlyRate: validated.hourlyRate,
      timezone: validated.timezone,
    })
    .where(eq(providers.userId, user.id));

  await logAuditEvent(db, {
    actorId: user.id,
    actorRole: user.role,
    action: 'record.update',
    resourceType: 'provider',
    resourceId: user.id,
    ipAddress: c.req.header('CF-Connecting-IP') || 'unknown',
    outcome: 'success',
  });

  return c.json({ ok: true });
});

providerRoutes.get('/:id/services', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const services = await getProviderServices(db, id);
  return c.json(services);
});
