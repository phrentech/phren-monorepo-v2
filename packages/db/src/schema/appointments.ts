import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { providers, providerServices } from './providers';

export const appointments = sqliteTable('appointments', {
  id: text('id').primaryKey(), // ULID
  patientId: text('patient_id').notNull().references(() => patients.userId),
  providerId: text('provider_id').notNull().references(() => providers.userId),
  serviceId: text('service_id').references(() => providerServices.id),
  status: text('status', { enum: ['scheduled', 'in_progress', 'completed', 'cancelled'] }).notNull().default('scheduled'),
  scheduledAt: text('scheduled_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  notes: text('notes'),
  sessionId: text('session_id'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const appointmentHistory = sqliteTable('appointment_history', {
  id: text('id').primaryKey(), // ULID
  appointmentId: text('appointment_id').notNull().references(() => appointments.id),
  status: text('status').notNull(),
  changedAt: text('changed_at').notNull().$defaultFn(() => new Date().toISOString()),
  changedBy: text('changed_by').notNull(),
});
