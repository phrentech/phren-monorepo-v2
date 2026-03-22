import { generateEncryptionKey, exportKey, importKey } from './encryption';

export async function getOrCreateKey(kv: KVNamespace, purpose: string): Promise<CryptoKey> {
  const stored = await kv.get(`encryption-key:${purpose}:current`);
  if (stored) return importKey(stored);

  const key = await generateEncryptionKey();
  const exported = await exportKey(key);
  await kv.put(`encryption-key:${purpose}:current`, exported);
  await kv.put(`encryption-key:${purpose}:v1`, exported);
  return key;
}

export async function rotateKey(kv: KVNamespace, purpose: string): Promise<{ newVersion: number }> {
  let version = 1;
  while (await kv.get(`encryption-key:${purpose}:v${version + 1}`)) version++;

  const newVersion = version + 1;
  const key = await generateEncryptionKey();
  const exported = await exportKey(key);
  await kv.put(`encryption-key:${purpose}:v${newVersion}`, exported);
  await kv.put(`encryption-key:${purpose}:current`, exported);
  return { newVersion };
}
