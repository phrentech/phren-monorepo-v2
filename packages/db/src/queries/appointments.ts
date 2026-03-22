import { eq, and, desc, gte } from 'drizzle-orm';
import type { Database } from '../client';
import { appointments, appointmentHistory } from '../schema';
import { generateUlid } from '@phren/core';

type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export async function createAppointment(
  db: Database,
  data: {
    patientId: string;
    providerId: string;
    serviceId: string;
    scheduledAt: string;
    durationMinutes: number;
  },
) {
  const id = generateUlid();
  const now = new Date().toISOString();
  await db.insert(appointments).values({ id, ...data, status: 'scheduled', createdAt: now });
  await db.insert(appointmentHistory).values({
    id: generateUlid(),
    appointmentId: id,
    status: 'scheduled',
    changedBy: data.patientId,
    changedAt: now,
  });
  return { id };
}

export async function listAppointmentsByPatient(
  db: Database,
  patientId: string,
  options?: { status?: string },
) {
  const conditions = [eq(appointments.patientId, patientId)];
  if (options?.status) conditions.push(eq(appointments.status, options.status as AppointmentStatus));
  return db
    .select()
    .from(appointments)
    .where(and(...conditions))
    .orderBy(desc(appointments.scheduledAt));
}

export async function listAppointmentsByProvider(
  db: Database,
  providerId: string,
  options?: { status?: string; upcoming?: boolean },
) {
  const conditions = [eq(appointments.providerId, providerId)];
  if (options?.status) conditions.push(eq(appointments.status, options.status as AppointmentStatus));
  if (options?.upcoming) {
    conditions.push(eq(appointments.status, 'scheduled'));
    conditions.push(gte(appointments.scheduledAt, new Date().toISOString()));
  }
  return db
    .select()
    .from(appointments)
    .where(and(...conditions))
    .orderBy(desc(appointments.scheduledAt));
}

export async function updateAppointmentStatus(
  db: Database,
  appointmentId: string,
  newStatus: string,
  changedBy: string,
) {
  await db
    .update(appointments)
    .set({ status: newStatus as AppointmentStatus })
    .where(eq(appointments.id, appointmentId));
  await db.insert(appointmentHistory).values({
    id: generateUlid(),
    appointmentId,
    status: newStatus,
    changedBy,
    changedAt: new Date().toISOString(),
  });
}

export async function getAppointmentById(db: Database, id: string) {
  const result = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function getAppointmentHistory(db: Database, appointmentId: string) {
  return db
    .select()
    .from(appointmentHistory)
    .where(eq(appointmentHistory.appointmentId, appointmentId))
    .orderBy(desc(appointmentHistory.changedAt));
}
