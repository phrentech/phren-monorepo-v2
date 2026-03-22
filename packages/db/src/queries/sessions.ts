import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import { telehealthSessions, sessionNotes } from '../schema';
import { generateUlid } from '@phren/core';

export async function createTelehealthSession(
  db: Database,
  data: { appointmentId: string; livekitRoomName: string },
) {
  const id = generateUlid();
  await db.insert(telehealthSessions).values({ id, ...data });
  return { id };
}

export async function getSessionByAppointment(db: Database, appointmentId: string) {
  const result = await db
    .select()
    .from(telehealthSessions)
    .where(eq(telehealthSessions.appointmentId, appointmentId))
    .limit(1);
  return result[0] ?? null;
}

export async function endSession(
  db: Database,
  sessionId: string,
  data: { endedAt: string; recordingUrl?: string },
) {
  await db.update(telehealthSessions).set(data).where(eq(telehealthSessions.id, sessionId));
}

export async function createSessionNote(
  db: Database,
  data: { sessionId: string; providerId: string; content: string },
) {
  const id = generateUlid();
  await db.insert(sessionNotes).values({ id, ...data, createdAt: new Date().toISOString() });
  return { id };
}

export async function getSessionNotes(db: Database, sessionId: string) {
  return db.select().from(sessionNotes).where(eq(sessionNotes.sessionId, sessionId));
}
