export interface KVHelpers {
  getPresence(kv: KVNamespace, userId: string): Promise<boolean>;
  setPresence(kv: KVNamespace, userId: string, ttlSeconds?: number): Promise<void>;
  removePresence(kv: KVNamespace, userId: string): Promise<void>;
  checkRateLimit(kv: KVNamespace, key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }>;
  cacheGet<T>(kv: KVNamespace, key: string): Promise<T | null>;
  cacheSet<T>(kv: KVNamespace, key: string, value: T, ttlSeconds: number): Promise<void>;
}

export const kvHelpers: KVHelpers = {
  async getPresence(kv, userId) {
    const val = await kv.get(`presence:${userId}`);
    return val !== null;
  },
  async setPresence(kv, userId, ttlSeconds = 300) {
    await kv.put(`presence:${userId}`, '1', { expirationTtl: ttlSeconds });
  },
  async removePresence(kv, userId) {
    await kv.delete(`presence:${userId}`);
  },
  // NOTE: This is best-effort rate limiting due to KV's eventual consistency.
  // For strict enforcement, use Cloudflare's built-in rate limiting rules (wrangler.toml).
  async checkRateLimit(kv, key, maxRequests, windowSeconds) {
    const current = parseInt(await kv.get(`ratelimit:${key}`) || '0');
    if (current >= maxRequests) return { allowed: false, remaining: 0 };
    await kv.put(`ratelimit:${key}`, String(current + 1), { expirationTtl: windowSeconds });
    return { allowed: true, remaining: maxRequests - current - 1 };
  },
  async cacheGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
    const val = await kv.get(`cache:${key}`, 'json');
    return val as T | null;
  },
  async cacheSet<T>(kv: KVNamespace, key: string, value: T, ttlSeconds: number) {
    await kv.put(`cache:${key}`, JSON.stringify(value), { expirationTtl: ttlSeconds });
  },
};
