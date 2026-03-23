import { createDb, queryByDateRange } from '@phren/db';
import { writeReport } from '../report';
import type { Env } from '../env';

export async function accessMonitor(env: Env) {
  const db = createDb(env.DB);
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  const recentLogs = await queryByDateRange(db, sixHoursAgo, now.toISOString(), { limit: 10000 });

  const accessCounts = new Map<string, number>();
  const deniedAccess = new Map<string, number>();
  for (const log of recentLogs) {
    accessCounts.set(log.actorId, (accessCounts.get(log.actorId) || 0) + 1);
    if (log.outcome === 'denied') {
      deniedAccess.set(log.actorId, (deniedAccess.get(log.actorId) || 0) + 1);
    }
  }

  const anomalies: { actorId: string; rule: string; count: number }[] = [];
  for (const [actorId, count] of accessCounts) {
    if (count > 100) anomalies.push({ actorId, rule: 'excessive_access', count });
  }
  for (const [actorId, count] of deniedAccess) {
    if (count > 10) anomalies.push({ actorId, rule: 'excessive_denied', count });
  }

  const reportKey = await writeReport(env, 'access-monitor', {
    period: { from: sixHoursAgo, to: now.toISOString() },
    totalEvents: recentLogs.length,
    uniqueActors: accessCounts.size,
    anomalies,
  });

  return { reportKey, anomalyCount: anomalies.length };
}
