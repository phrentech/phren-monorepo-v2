import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { appointments } from './appointments';
import { providers } from './providers';

export const telehealthSessions = sqliteTable('telehealth_sessions', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().references(() => appointments.id),
  livekitRoomName: text('livekit_room_name'),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  recordingUrl: text('recording_url'),
  vrEnabled: integer('vr_enabled', { mode: 'boolean' }).notNull().default(false),
});

export const sessionNotes = sqliteTable('session_notes', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => telehealthSessions.id),
  providerId: text('provider_id').notNull().references(() => providers.userId),
  content: text('content').notNull(), // encrypted at app layer
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
