import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import type { Database } from '@phren/db';
import { sessions, users } from '@phren/db';
import { eq } from 'drizzle-orm';
import type { SessionUser } from './types';

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashSessionToken(token: string): string {
  const encoded = new TextEncoder().encode(token);
  const hash = sha256(encoded);
  return encodeHexLowerCase(hash);
}

export async function createSession(db: Database, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const sessionId = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function validateSession(db: Database, token: string): Promise<{ user: SessionUser; expiresAt: Date } | null> {
  const sessionId = hashSessionToken(token);
  const result = await db.select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!result[0]) return null;

  const session = result[0].sessions;
  const user = result[0].users;

  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Auto-refresh if within 15 days of expiry
  const fifteenDays = 15 * 24 * 60 * 60 * 1000;
  if (session.expiresAt.getTime() - Date.now() < fifteenDays) {
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId));
    session.expiresAt = newExpiry;
  }

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role as SessionUser['role'] },
    expiresAt: session.expiresAt,
  };
}

export async function invalidateSession(db: Database, token: string): Promise<void> {
  const sessionId = hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
