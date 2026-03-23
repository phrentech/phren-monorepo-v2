export interface Env {
  DB: D1Database;
  KV_SESSIONS: KVNamespace;
  KV_PRESENCE: KVNamespace;
  SESSION_COORDINATOR: DurableObjectNamespace;
}
