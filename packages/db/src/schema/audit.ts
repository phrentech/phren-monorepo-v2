import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  actorId: text('actor_id').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  detail: text('detail'),
  ipAddress: text('ip_address').notNull(),
  outcome: text('outcome', { enum: ['success', 'denied'] }).notNull(),
});
