import { eq, desc } from 'drizzle-orm';
import type { Database } from '../client';
import { matchingConversations, matchingMessages } from '../schema';
import { generateUlid } from '@phren/core';

export async function createMatchingConversation(db: Database, patientId: string) {
  const id = generateUlid();
  await db.insert(matchingConversations).values({
    id,
    patientId,
    createdAt: new Date().toISOString(),
  });
  return { id };
}

export async function getActiveMatchingConversation(db: Database, patientId: string) {
  const result = await db
    .select()
    .from(matchingConversations)
    .where(eq(matchingConversations.patientId, patientId))
    .orderBy(desc(matchingConversations.createdAt))
    .limit(1);
  return result[0] ?? null;
}

export async function addMatchingMessage(
  db: Database,
  conversationId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
) {
  const id = generateUlid();
  await db.insert(matchingMessages).values({
    id,
    conversationId,
    role,
    content,
    createdAt: new Date().toISOString(),
  });
  return { id };
}

export async function getMatchingMessages(db: Database, conversationId: string) {
  return db
    .select()
    .from(matchingMessages)
    .where(eq(matchingMessages.conversationId, conversationId))
    .orderBy(matchingMessages.createdAt);
}

export async function completeMatchingConversation(
  db: Database,
  conversationId: string,
  recommendedProviderIds: string[],
) {
  await db
    .update(matchingConversations)
    .set({
      completed: true,
      recommendedProviderIds: JSON.stringify(recommendedProviderIds),
    })
    .where(eq(matchingConversations.id, conversationId));
}
