import { describe, it, expect } from 'vitest';
import { requireAuth, requireRole, AuthError } from '../src/guards';
import type { SessionUser } from '../src/types';

const mockUser: SessionUser = {
  id: '01ABC',
  email: 'test@example.com',
  name: 'Test User',
  role: 'patient',
};

describe('requireAuth', () => {
  it('returns the user when authenticated', () => {
    expect(requireAuth(mockUser)).toBe(mockUser);
  });

  it('throws 401 AuthError when user is null', () => {
    expect(() => requireAuth(null)).toThrow(AuthError);
    try {
      requireAuth(null);
    } catch (e) {
      expect((e as AuthError).status).toBe(401);
    }
  });
});

describe('requireRole', () => {
  it('returns user when role matches', () => {
    expect(requireRole(mockUser, 'patient')).toBe(mockUser);
  });

  it('returns user when role is in allowed list', () => {
    expect(requireRole(mockUser, 'provider', 'patient')).toBe(mockUser);
  });

  it('throws 403 AuthError when role does not match', () => {
    expect(() => requireRole(mockUser, 'admin')).toThrow(AuthError);
    try {
      requireRole(mockUser, 'admin');
    } catch (e) {
      expect((e as AuthError).status).toBe(403);
    }
  });

  it('throws 401 when user is null', () => {
    try {
      requireRole(null, 'patient');
    } catch (e) {
      expect((e as AuthError).status).toBe(401);
    }
  });
});
