import { createDb, patients } from '@phren/db';
import { writeReport } from '../report';
import type { Env } from '../env';

export async function phiScanner(env: Env) {
  const db = createDb(env.DB);
  const BATCH_SIZE = 100;
  let offset = 0;
  let batch;
  const issues: { table: string; field: string; recordId: string }[] = [];
  let totalScanned = 0;

  do {
    batch = await db.select().from(patients).limit(BATCH_SIZE).offset(offset);
    for (const p of batch) {
      if (p.emergencyContact && !p.emergencyContact.match(/^[A-Za-z0-9+/=]{20,}$/)) {
        issues.push({ table: 'patients', field: 'emergency_contact', recordId: p.userId });
      }
    }
    totalScanned += batch.length;
    offset += BATCH_SIZE;
  } while (batch.length === BATCH_SIZE);

  const reportKey = await writeReport(env, 'phi-scanner', {
    recordsScanned: totalScanned,
    issues,
  });

  return { reportKey, issueCount: issues.length };
}
