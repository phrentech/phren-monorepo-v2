import { Hono } from 'hono';
import { Google, MicrosoftEntraId, Apple } from 'arctic';
import { createSession, invalidateSession } from '@phren/auth';
import { createDb, oauthAccounts, users } from '@phren/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@phren/core';
import type { Env } from '../env';

export const authRoutes = new Hono<{ Bindings: Env }>();

// ---------- helpers ----------

function getGoogleClient(env: Env) {
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, 'https://api.phrentech.com/auth/google/callback');
}

function getMicrosoftClient(env: Env) {
  return new MicrosoftEntraId(env.MICROSOFT_TENANT || 'common', env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET, 'https://api.phrentech.com/auth/microsoft/callback');
}

function getAppleClient(env: Env) {
  const pkcs8 = new TextEncoder().encode(env.APPLE_PRIVATE_KEY);
  return new Apple(env.APPLE_CLIENT_ID, env.APPLE_TEAM_ID, env.APPLE_KEY_ID, pkcs8, 'https://api.phrentech.com/auth/apple/callback');
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url-encode without padding
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------- initiate OAuth ----------

authRoutes.get('/:provider', async (c) => {
  const provider = c.req.param('provider');

  if (provider !== 'google' && provider !== 'microsoft' && provider !== 'apple') {
    return c.json({ error: 'Unknown provider' }, 400);
  }

  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const scopes = ['openid', 'email', 'profile'];

  let url: URL;

  if (provider === 'google') {
    url = getGoogleClient(c.env).createAuthorizationURL(state, codeVerifier, scopes);
  } else if (provider === 'microsoft') {
    url = getMicrosoftClient(c.env).createAuthorizationURL(state, codeVerifier, scopes);
  } else {
    // Apple does not use PKCE
    url = getAppleClient(c.env).createAuthorizationURL(state, scopes);
  }

  // Store state + codeVerifier in KV (10 min TTL)
  await c.env.KV_SESSIONS.put(
    `oauth-state:${state}`,
    JSON.stringify({ provider, codeVerifier }),
    { expirationTtl: 600 },
  );

  return c.redirect(url.toString());
});

// ---------- OAuth callback ----------

authRoutes.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider');
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.json({ error: 'Missing code or state' }, 400);
  }

  const stored = await c.env.KV_SESSIONS.get(`oauth-state:${state}`);
  if (!stored) {
    return c.json({ error: 'Invalid or expired state' }, 400);
  }

  const { provider: storedProvider, codeVerifier } = JSON.parse(stored) as {
    provider: string;
    codeVerifier: string;
  };

  if (storedProvider !== provider) {
    return c.json({ error: 'State/provider mismatch' }, 400);
  }

  await c.env.KV_SESSIONS.delete(`oauth-state:${state}`);

  // Exchange authorization code for tokens
  let providerUserId: string;
  let email: string;
  let name: string;

  if (provider === 'google') {
    const tokens = await getGoogleClient(c.env).validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = (await res.json()) as Record<string, string>;
    providerUserId = info.sub;
    email = info.email;
    name = info.name;
  } else if (provider === 'microsoft') {
    const tokens = await getMicrosoftClient(c.env).validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = (await res.json()) as Record<string, string>;
    providerUserId = info.id;
    email = info.mail || info.userPrincipalName;
    name = info.displayName;
  } else if (provider === 'apple') {
    const tokens = await getAppleClient(c.env).validateAuthorizationCode(code);
    const idToken = tokens.idToken();
    const claims = JSON.parse(atob(idToken.split('.')[1])) as Record<string, string>;
    providerUserId = claims.sub;
    email = claims.email;
    name = claims.email.split('@')[0];
  } else {
    return c.json({ error: 'Unknown provider' }, 400);
  }

  const db = createDb(c.env.DB);

  // Look up existing OAuth account
  const existingAccount = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.providerId, provider), eq(oauthAccounts.providerUserId, providerUserId)))
    .limit(1);

  let userId: string;
  let isNewUser = false;

  if (existingAccount[0]) {
    userId = existingAccount[0].userId;
  } else {
    userId = generateUlid();
    isNewUser = true;

    await db.insert(users).values({
      id: userId,
      email,
      name,
      role: 'patient',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.insert(oauthAccounts).values({
      providerId: provider,
      providerUserId,
      userId,
    });
  }

  // Create session
  const { token } = await createSession(db, userId);

  const cookie = `session=${token}; Domain=.phrentech.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
  c.header('Set-Cookie', cookie);

  const redirectUrl = isNewUser
    ? 'https://patient.phrentech.com/onboarding/role-selection'
    : 'https://patient.phrentech.com';
  return c.redirect(redirectUrl);
});

// ---------- logout ----------

authRoutes.post('/logout', async (c) => {
  const cookieHeader = c.req.header('Cookie');
  const token = cookieHeader?.match(/session=([^;]+)/)?.[1];

  if (token) {
    const db = createDb(c.env.DB);
    await invalidateSession(db, token);
  }

  c.header('Set-Cookie', 'session=; Domain=.phrentech.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return c.json({ ok: true });
});
