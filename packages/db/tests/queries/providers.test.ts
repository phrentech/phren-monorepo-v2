import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../src/schema';
import { getProviderById, searchProviders } from '../../src/queries/providers';

describe('provider queries', () => {
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: '../../infrastructure/d1-migrations' });
    // Insert seed data
    db.insert(schema.users).values({
      id: 'user-1',
      email: 'provider@test.com',
      name: 'Dr. Test',
      role: 'provider',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    db.insert(schema.providers).values({
      userId: 'user-1',
      bio: 'Test bio',
      specialization: 'anxiety',
      yearsExperience: 10,
      hourlyRate: 150,
      timezone: 'America/New_York',
      status: 'active',
    }).run();
  });

  it('finds provider by user ID', async () => {
    const provider = await getProviderById(db as any, 'user-1');
    expect(provider).toBeDefined();
    expect(provider?.providers.bio).toBe('Test bio');
  });

  it('searches providers by specialization', async () => {
    const results = await searchProviders(db as any, { specialization: 'anxiety' });
    expect(results).toHaveLength(1);
  });
});
