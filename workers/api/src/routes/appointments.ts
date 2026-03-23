import { Hono } from 'hono';
import type { Env } from '../env';
import type { AppVariables } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createAppointment,
  listAppointmentsByPatient,
  listAppointmentsByProvider,
  getAppointmentById,
  updateAppointmentStatus,
} from '@phren/db';
import { createAppointmentSchema } from '@phren/core';
import { logAuditEvent } from '@phren/audit';

export const appointmentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

appointmentRoutes.post('/', requireRole('patient'), async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const validated = createAppointmentSchema.parse(body);

  const { id } = await createAppointment(db, { ...validated, patientId: user.id });

  await logAuditEvent(db, {
    actorId: user.id,
    actorRole: user.role,
    action: 'record.create',
    resourceType: 'appointment',
    resourceId: id,
    ipAddress: c.req.header('CF-Connecting-IP') || 'unknown',
    outcome: 'success',
  });

  return c.json({ id }, 201);
});

appointmentRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const status = c.req.query('status');

  const list =
    user.role === 'patient'
      ? await listAppointmentsByPatient(db, user.id, { status: status || undefined })
      : await listAppointmentsByProvider(db, user.id, { status: status || undefined });

  return c.json(list);
});

appointmentRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');
  const appointment = await getAppointmentById(db, id);

  if (!appointment) return c.json({ error: 'Not found' }, 404);
  if (appointment.patientId !== user.id && appointment.providerId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  await logAuditEvent(db, {
    actorId: user.id,
    actorRole: user.role,
    action: 'record.read',
    resourceType: 'appointment',
    resourceId: id,
    ipAddress: c.req.header('CF-Connecting-IP') || 'unknown',
    outcome: 'success',
  });

  return c.json(appointment);
});

appointmentRoutes.patch('/:id/status', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');
  const { status } = await c.req.json();

  const appointment = await getAppointmentById(db, id);
  if (!appointment) return c.json({ error: 'Not found' }, 404);

  const validTransitions: Record<string, string[]> = {
    scheduled: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'paused'],
    paused: ['in_progress', 'cancelled'],
  };

  if (!validTransitions[appointment.status]?.includes(status)) {
    return c.json({ error: `Cannot transition from ${appointment.status} to ${status}` }, 400);
  }

  if (status === 'cancelled' && appointment.patientId !== user.id && appointment.providerId !== user.id) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  } else if (status !== 'cancelled' && appointment.providerId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  await updateAppointmentStatus(db, id, status, user.id);

  await logAuditEvent(db, {
    actorId: user.id,
    actorRole: user.role,
    action: 'record.update',
    resourceType: 'appointment',
    resourceId: id,
    detail: `status: ${appointment.status} -> ${status}`,
    ipAddress: c.req.header('CF-Connecting-IP') || 'unknown',
    outcome: 'success',
  });

  return c.json({ ok: true });
});
