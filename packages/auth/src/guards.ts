import type { UserRole } from '@phren/core';
import type { SessionUser } from './types';

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireAuth(user: SessionUser | null): SessionUser {
  if (!user) throw new AuthError(401, 'Authentication required');
  return user;
}

export function requireRole(user: SessionUser | null, ...roles: UserRole[]): SessionUser {
  const authed = requireAuth(user);
  if (!roles.includes(authed.role)) throw new AuthError(403, 'Insufficient permissions');
  return authed;
}
