import { Hono } from 'hono';
import { AccessToken } from 'livekit-server-sdk';
import type { Env } from '../env';
import type { AppVariables } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getAppointmentById,
  getSessionByAppointment,
  createTelehealthSession,
  createSessionNote,
} from '@phren/db';

export const sessionRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /api/sessions/join — Join/create a telehealth session
sessionRoutes.post('/join', async (c) => {
  const user = c.get('user' as never) as { id: string; role: string; name: string } | null;
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const db = c.get('db' as never) as AppVariables['db'];
  const body = await c.req.json<{ appointmentId: string }>();
  const { appointmentId } = body;

  if (!appointmentId) {
    return c.json({ error: 'appointmentId is required' }, 400);
  }

  const appointment = await getAppointmentById(db, appointmentId);
  if (!appointment) {
    return c.json({ error: 'Appointment not found' }, 404);
  }

  if (appointment.patientId !== user.id && appointment.providerId !== user.id) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  const role = appointment.patientId === user.id ? 'patient' : 'provider';
  const roomName = `phren-${appointmentId}`;

  let session = await getSessionByAppointment(db, appointmentId);
  let isNew = false;

  if (!session) {
    const { id } = await createTelehealthSession(db, {
      appointmentId,
      livekitRoomName: roomName,
    });
    session = { id, appointmentId, livekitRoomName: roomName, startedAt: null, endedAt: null, recordingUrl: null, vrEnabled: false };
    isNew = true;
  }

  if (isNew) {
    const coordinatorId = c.env.SESSION_COORDINATOR.idFromName(roomName);
    const coordinatorStub = c.env.SESSION_COORDINATOR.get(coordinatorId);
    await coordinatorStub.fetch('https://do/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, roomName }),
    });
  }

  const token = new AccessToken(c.env.LIVEKIT_API_KEY, c.env.LIVEKIT_API_SECRET, {
    identity: `${role}-${user.id}`,
    name: user.name,
    metadata: JSON.stringify({ role, userId: user.id }),
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const jwt = await token.toJwt();

  const coordinatorId = c.env.SESSION_COORDINATOR.idFromName(roomName);
  const doWebSocketUrl = `wss://session.phrentech.com/ws/${coordinatorId}`;

  return c.json({
    token: jwt,
    roomName,
    livekitUrl: c.env.LIVEKIT_URL,
    sessionId: session.id,
    doWebSocketUrl,
  });
});

// GET /api/sessions/:appointmentId/status — Get session state from DO
sessionRoutes.get('/:appointmentId/status', async (c) => {
  const user = c.get('user' as never) as { id: string; role: string; name: string } | null;
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const appointmentId = c.req.param('appointmentId');
  const roomName = `phren-${appointmentId}`;

  const coordinatorId = c.env.SESSION_COORDINATOR.idFromName(roomName);
  const coordinatorStub = c.env.SESSION_COORDINATOR.get(coordinatorId);
  const response = await coordinatorStub.fetch('https://do/status');

  const data = await response.json();
  return c.json(data);
});

// POST /api/sessions/:appointmentId/notes — Create session note (provider only)
sessionRoutes.post('/:appointmentId/notes', requireRole('provider'), async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const appointmentId = c.req.param('appointmentId');
  const body = await c.req.json<{ content: string }>();
  const { content } = body;

  if (!content) {
    return c.json({ error: 'content is required' }, 400);
  }

  const session = await getSessionByAppointment(db, appointmentId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const { id } = await createSessionNote(db, {
    sessionId: session.id,
    providerId: user.id,
    content,
  });

  return c.json({ id }, 201);
});
