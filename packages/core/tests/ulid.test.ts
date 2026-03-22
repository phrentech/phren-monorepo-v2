import { describe, it, expect } from 'vitest';
import { generateUlid } from '../src/ulid';

describe('generateUlid', () => {
  it('returns a 26-character string', () => {
    const id = generateUlid();
    expect(id).toHaveLength(26);
  });

  it('generates sortable IDs (later calls produce greater values)', async () => {
    const id1 = generateUlid();
    await new Promise(r => setTimeout(r, 2));
    const id2 = generateUlid();
    expect(id2 > id1).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUlid()));
    expect(ids.size).toBe(100);
  });
});
