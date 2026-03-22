import { createMiddleware } from 'hono/factory';
import { createDb, type Database } from '@phren/db';
import { validateSession, type SessionUser } from '@phren/auth';
import type { Env } from '../env';

export type AppVariables = {
  user: SessionUser;
  db: Database;
};

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const cookie = c.req.header('Cookie');
  const token = cookie?.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const db = createDb(c.env.DB);
  const result = await validateSession(db, token);

  if (!result) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  c.set('user', result.user);
  c.set('db', db);
  await next();
});
