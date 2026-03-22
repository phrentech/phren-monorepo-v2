import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const patients = sqliteTable('patients', {
  userId: text('user_id').primaryKey().references(() => users.id),
  dateOfBirth: text('date_of_birth'),
  emergencyContact: text('emergency_contact'), // encrypted at app layer
  intakeCompleted: integer('intake_completed', { mode: 'boolean' }).notNull().default(false),
});

export const patientPreferences = sqliteTable('patient_preferences', {
  id: text('id').primaryKey(), // ULID
  patientId: text('patient_id').notNull().references(() => patients.userId),
  category: text('category').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
});
