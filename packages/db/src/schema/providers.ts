import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const providers = sqliteTable('providers', {
  userId: text('user_id').primaryKey().references(() => users.id),
  bio: text('bio'),
  specialization: text('specialization'),
  yearsExperience: integer('years_experience'),
  hourlyRate: real('hourly_rate'),
  timezone: text('timezone'),
  status: text('status', { enum: ['pending_review', 'active', 'inactive'] }).notNull().default('pending_review'),
});

export const providerLicenses = sqliteTable('provider_licenses', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => providers.userId),
  state: text('state').notNull(),
  licenseNumber: text('license_number').notNull(),
  expiryDate: text('expiry_date'),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
});

export const providerServices = sqliteTable('provider_services', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => providers.userId),
  serviceName: text('service_name').notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull(),
  price: real('price').notNull(),
});

export const providerAvailability = sqliteTable('provider_availability', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => providers.userId),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sunday
  startTime: text('start_time').notNull(),     // HH:MM
  endTime: text('end_time').notNull(),         // HH:MM
});
