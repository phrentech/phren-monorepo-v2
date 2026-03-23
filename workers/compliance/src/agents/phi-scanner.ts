import { createDb, patients } from '@phren/db';
import { writeReport } from '../report';
import type { Env } from '../env';

export async function phiScanner(env: Env) {
  const db = createDb(env.DB);
  const allPatients = await db.select().from(patients).limit(100);
  const issues: { table: string; field: string; recordId: string }[] = [];

  for (const p of allPatients) {
    if (p.emergencyContact && !p.emergencyContact.match(/^[A-Za-z0-9+/=]{20,}$/)) {
      issues.push({ table: 'patients', field: 'emergency_contact', recordId: p.userId });
    }
  }

  const reportKey = await writeReport(env, 'phi-scanner', {
    recordsScanned: allPatients.length,
    issues,
  });

  return { reportKey, issueCount: issues.length };
}
