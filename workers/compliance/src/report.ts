import type { Env } from './env';

export async function writeReport(env: Env, reportType: string, data: Record<string, unknown>) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `compliance/${reportType}/${timestamp}.json`;
  const body = JSON.stringify(
    { reportType, generatedAt: new Date().toISOString(), ...data },
    null,
    2,
  );
  await env.R2_COMPLIANCE_REPORTS.put(key, body, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { reportType, generatedAt: new Date().toISOString() },
  });
  return key;
}
