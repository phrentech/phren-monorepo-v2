import { sql } from 'drizzle-orm';
import { createDb } from '@phren/db';
import { writeReport } from '../report';
import type { Env } from '../env';

export async function integrityChecker(env: Env) {
  const db = createDb(env.DB);
  const checks: { check: string; status: 'pass' | 'fail'; detail?: string }[] = [];

  const orphanedAccounts = await db.all(
    sql`SELECT oa.provider_id, oa.provider_user_id FROM oauth_accounts oa LEFT JOIN users u ON oa.user_id = u.id WHERE u.id IS NULL`,
  );
  checks.push({
    check: 'oauth_accounts_referential_integrity',
    status: orphanedAccounts.length === 0 ? 'pass' : 'fail',
    detail: `${orphanedAccounts.length} orphaned accounts`,
  });

  const orphanedAppointments = await db.all(
    sql`SELECT a.id FROM appointments a LEFT JOIN patients p ON a.patient_id = p.user_id LEFT JOIN providers pr ON a.provider_id = pr.user_id WHERE p.user_id IS NULL OR pr.user_id IS NULL`,
  );
  checks.push({
    check: 'appointments_referential_integrity',
    status: orphanedAppointments.length === 0 ? 'pass' : 'fail',
    detail: `${orphanedAppointments.length} orphaned appointments`,
  });

  const reportKey = await writeReport(env, 'integrity-checker', { checks });
  return { reportKey, failCount: checks.filter((c) => c.status === 'fail').length };
}
