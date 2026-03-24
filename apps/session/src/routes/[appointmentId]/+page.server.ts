import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
  if (!locals.user) {
    throw redirect(302, '/');
  }

  const { appointmentId } = params;

  const response = await fetch('/api/sessions/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointmentId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Failed to join session' }));
    return {
      appointmentId,
      error: body.error ?? 'Failed to join session',
      token: null,
      roomName: null,
      livekitUrl: null,
      sessionId: null,
      doWebSocketUrl: null,
      user: locals.user,
    };
  }

  const data = await response.json();

  return {
    appointmentId,
    token: data.token as string,
    roomName: data.roomName as string,
    livekitUrl: data.livekitUrl as string,
    sessionId: data.sessionId as string,
    doWebSocketUrl: data.doWebSocketUrl as string,
    user: locals.user,
    error: null,
  };
};
