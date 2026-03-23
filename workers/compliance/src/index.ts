import { accessMonitor } from './agents/access-monitor';
import { phiScanner } from './agents/phi-scanner';
import { integrityChecker } from './agents/integrity-checker';
import { monthlyReview } from './agents/monthly-review';
import type { Env } from './env';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case '0 */6 * * *': // every 6 hours
        ctx.waitUntil(accessMonitor(env));
        break;
      case '0 2 * * *': // daily at 2 AM
        ctx.waitUntil(phiScanner(env));
        ctx.waitUntil(integrityChecker(env));
        break;
      case '0 9 1 * *': // 1st of month at 9 AM
        ctx.waitUntil(monthlyReview(env));
        break;
    }
  },
};
