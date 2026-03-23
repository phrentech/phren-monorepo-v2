import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { createDb } from '@phren/db';
import { validateSession } from '@phren/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');
  event.locals.user = null;

  if (token && event.platform?.env?.DB) {
    const db = createDb(event.platform.env.DB);
    const result = await validateSession(db, token);
    if (result) {
      event.locals.user = result.user;
      // Provider app: reject non-providers
      if (result.user.role !== 'provider' && result.user.role !== 'admin') {
        throw redirect(302, 'https://patient.phrentech.com');
      }
    }
  }

  return resolve(event);
};
