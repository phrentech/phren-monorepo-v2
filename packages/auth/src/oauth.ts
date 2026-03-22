import { Google, MicrosoftEntraId, Apple } from 'arctic';

export interface OAuthConfig {
  google: { clientId: string; clientSecret: string; redirectUri: string };
  microsoft: { clientId: string; clientSecret: string; redirectUri: string; tenant: string };
  apple: { clientId: string; teamId: string; keyId: string; pkcs8PrivateKey: Uint8Array; redirectUri: string };
}

export function createOAuthProviders(config: OAuthConfig) {
  return {
    google: new Google(config.google.clientId, config.google.clientSecret, config.google.redirectUri),
    microsoft: new MicrosoftEntraId(config.microsoft.tenant, config.microsoft.clientId, config.microsoft.clientSecret, config.microsoft.redirectUri),
    apple: new Apple(config.apple.clientId, config.apple.teamId, config.apple.keyId, config.apple.pkcs8PrivateKey, config.apple.redirectUri),
  };
}

export type OAuthProviderName = 'google' | 'microsoft' | 'apple';
