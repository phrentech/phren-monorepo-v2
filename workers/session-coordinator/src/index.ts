import type { Env } from './env.js';
export { SessionCoordinator } from './session-do.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/session\/([^/]+)(\/.*)?$/);
    if (!match) return new Response('Not found', { status: 404 });

    const sessionId = match[1];
    const subPath = match[2] ?? '/status';
    const doId = env.SESSION_COORDINATOR.idFromName(sessionId);
    const stub = env.SESSION_COORDINATOR.get(doId);

    const doUrl = new URL(request.url);
    doUrl.pathname = subPath;
    return stub.fetch(new Request(doUrl.toString(), request));
  },
};
