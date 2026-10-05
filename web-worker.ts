import handler from 'vinext/server/fetch-handler';
import { CSV_RETENTION_CRON, purgeExpiredCsvJobs } from './lib/csv-retention';

// Canonical deployments apply drizzle migrations before serving traffic. This
// entrypoint deliberately does not bootstrap or alter an existing database.
export default {
  fetch: handler.fetch,
  async scheduled(controller: ScheduledController, env: { DB: D1Database; BUCKET: R2Bucket }) {
    if (controller.cron !== CSV_RETENTION_CRON) return;
    const summary = await purgeExpiredCsvJobs(env.DB, env.BUCKET);
    console.info(JSON.stringify({ event: 'csv-retention', ...summary }));
    if (summary.failed) throw new Error(`CSV retention incomplete: ${summary.failed} failed`);
  },
};
