import { describe, it, expect } from 'vitest';
import { generateSessionToken, hashSessionToken } from '../src/session';

describe('session tokens', () => {
  it('generates a random token string', () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(20);
  });

  it('generates unique tokens', () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).not.toBe(t2);
  });

  it('hashes token deterministically', () => {
    const token = 'test-token-123';
    const h1 = hashSessionToken(token);
    const h2 = hashSessionToken(token);
    expect(h1).toBe(h2);
  });

  it('hash differs from input', () => {
    const token = 'test-token-123';
    const hash = hashSessionToken(token);
    expect(hash).not.toBe(token);
  });
});
