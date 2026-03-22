import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/encryption';

describe('AES-256-GCM encryption', () => {
  it('encrypts and decrypts round-trip', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const plaintext = 'sensitive patient data';
    const encrypted = await encrypt(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const plaintext = 'test data';
    const e1 = await encrypt(plaintext, key);
    const e2 = await encrypt(plaintext, key);
    expect(e1).not.toBe(e2);
  });
});
