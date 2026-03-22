import { eq, and, isNull, desc } from 'drizzle-orm';
import type { Database } from '../client';
import { conversations, messages } from '../schema';
import { generateUlid } from '@phren/core';

export async function getOrCreateConversation(
  db: Database,
  patientId: string,
  providerId: string,
) {
  const existing = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.patientId, patientId), eq(conversations.providerId, providerId)))
    .limit(1);
  if (existing[0]) return existing[0];
  const id = generateUlid();
  const now = new Date().toISOString();
  await db.insert(conversations).values({ id, patientId, providerId, createdAt: now });
  return { id, patientId, providerId, createdAt: now, lastMessageAt: null };
}

export async function getConversationsForUser(
  db: Database,
  userId: string,
  role: 'patient' | 'provider',
) {
  const field = role === 'patient' ? conversations.patientId : conversations.providerId;
  return db
    .select()
    .from(conversations)
    .where(eq(field, userId))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function sendMessage(
  db: Database,
  conversationId: string,
  senderId: string,
  content: string,
) {
  const id = generateUlid();
  const now = new Date().toISOString();
  await db.insert(messages).values({ id, conversationId, senderId, content, createdAt: now });
  await db
    .update(conversations)
    .set({ lastMessageAt: now })
    .where(eq(conversations.id, conversationId));
  return { id };
}

export async function getMessages(db: Database, conversationId: string, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

export async function markRead(db: Database, conversationId: string, userId: string) {
  const now = new Date().toISOString();
  const unread = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.readAt)));
  for (const msg of unread) {
    if (msg.senderId !== userId) {
      await db.update(messages).set({ readAt: now }).where(eq(messages.id, msg.id));
    }
  }
}

export async function getUnreadCount(db: Database, userId: string, role: 'patient' | 'provider') {
  const userConversations = await getConversationsForUser(db, userId, role);
  let count = 0;
  for (const conv of userConversations) {
    const unread = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), isNull(messages.readAt)));
    count += unread.filter((m) => m.senderId !== userId).length;
  }
  return count;
}
