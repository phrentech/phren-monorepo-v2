import { createDb, queryByDateRange } from '@phren/db';
import { writeReport } from '../report';
import type { Env } from '../env';

export async function monthlyReview(env: Env) {
  const db = createDb(env.DB);
  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();

  const allLogs = await queryByDateRange(db, monthAgo, now.toISOString(), { limit: 50000 });

  const actionCounts = new Map<string, number>();
  const deniedCount = allLogs.filter((l) => l.outcome === 'denied').length;
  for (const log of allLogs) {
    actionCounts.set(log.action, (actionCounts.get(log.action) || 0) + 1);
  }

  const reportKey = await writeReport(env, 'monthly-review', {
    period: { from: monthAgo, to: now.toISOString() },
    totalAuditEvents: allLogs.length,
    deniedAccessAttempts: deniedCount,
    actionBreakdown: Object.fromEntries(actionCounts),
    requiresHumanReview: true,
  });

  return { reportKey };
}
