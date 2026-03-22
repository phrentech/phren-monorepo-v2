import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),              // ULID
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['patient', 'provider', 'admin'] }).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export const oauthAccounts = sqliteTable('oauth_accounts', {
  providerId: text('provider_id').notNull(),       // 'google' | 'microsoft' | 'apple'
  providerUserId: text('provider_user_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
}, (table) => [
  primaryKey({ columns: [table.providerId, table.providerUserId] }),
]);
