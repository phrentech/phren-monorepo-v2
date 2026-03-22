import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

export const matchingConversations = sqliteTable('matching_conversations', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull().references(() => patients.userId),
  recommendedProviderIds: text('recommended_provider_ids'),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const matchingMessages = sqliteTable('matching_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => matchingConversations.id),
  role: text('role', { enum: ['user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
