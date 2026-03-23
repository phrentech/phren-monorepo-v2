import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { providers } from './providers';
import { users } from './users';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.userId),
  providerId: text('provider_id').notNull().references(() => providers.userId),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  lastMessageAt: text('last_message_at'),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  senderId: text('sender_id').notNull().references(() => users.id),
  content: text('content').notNull(), // encrypted at app layer
  readAt: text('read_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index('idx_messages_conversation_id').on(table.conversationId),
]);
