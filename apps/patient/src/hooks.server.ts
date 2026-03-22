import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// TODO: session validation from @phren/auth
	return resolve(event);
};
