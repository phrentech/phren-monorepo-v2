import { eq, and, like } from 'drizzle-orm';
import type { Database } from '../client';
import { providers, providerServices, providerLicenses, providerAvailability, users } from '../schema';

export async function getProviderById(db: Database, userId: string) {
  const result = await db
    .select()
    .from(providers)
    .innerJoin(users, eq(providers.userId, users.id))
    .where(eq(providers.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export interface SearchProvidersOptions {
  specialization?: string;
  maxPrice?: number;
  status?: string;
  limit?: number;
  cursor?: string;
}

export async function searchProviders(db: Database, options: SearchProvidersOptions) {
  const statusValue = (options.status ?? 'active') as 'pending_review' | 'active' | 'inactive';
  const conditions = [eq(providers.status, statusValue)];
  if (options.specialization) {
    conditions.push(like(providers.specialization, `%${options.specialization}%`));
  }

  return db
    .select()
    .from(providers)
    .innerJoin(users, eq(providers.userId, users.id))
    .where(and(...conditions))
    .limit(options.limit ?? 20);
}

export async function getProviderServices(db: Database, providerId: string) {
  return db.select().from(providerServices).where(eq(providerServices.providerId, providerId));
}

export async function getProviderLicenses(db: Database, providerId: string) {
  return db.select().from(providerLicenses).where(eq(providerLicenses.providerId, providerId));
}

export async function getProviderAvailability(db: Database, providerId: string) {
  return db.select().from(providerAvailability).where(eq(providerAvailability.providerId, providerId));
}
