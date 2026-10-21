import {
  linuxServiceStore,
  type LinuxServiceConfig,
} from '../../../lib/sky-linux-service-store.ts';
import { linuxPaymentHandler } from '../../../lib/sky-linux-payment-handler.ts';
import type { LinuxWorkspace } from '../../../lib/sky-linux-service.ts';
type Runtime = LinuxServiceConfig & { DB: D1Database; [key: string]: unknown };
/** Operator-controlled billing scheduler. No author code or LLM executes in this controller. */
export async function closeLinuxBillingMonths(env: Runtime, now = Date.now()) {
  if (
    env.SKY_LINUX_SERVICE_ENABLED !== 'true' ||
    env.SKY_LINUX_BILLING_ENABLED !== 'true'
  )
    return { processed: 0, held: 0 };
  const store = linuxServiceStore(env.DB, env),
    billing = linuxPaymentHandler(env.DB, env);
  const rows = await env.DB.prepare(
    `SELECT id,owner_user_id AS ownerId,payload FROM sky_linux_service_documents WHERE kind='workspace' ORDER BY updated_at LIMIT 100`,
  ).all<{ id: string; ownerId: string; payload: string }>();
  let processed = 0,
    held = 0;
  for (const row of rows.results) {
    try {
      const initial = JSON.parse(row.payload) as LinuxWorkspace,
        start = new Date(initial.acceptedAt);
      const month = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
        ),
        currentMonth = Date.UTC(
          new Date(now).getUTCFullYear(),
          new Date(now).getUTCMonth(),
          1,
        );
      for (
        let count = 0;
        month.getTime() < currentMonth && count < 120;
        count++, month.setUTCMonth(month.getUTCMonth() + 1)
      ) {
        let doc = (await store.get(row.ownerId))!;
        const period = month.toISOString().slice(0, 7);
        if (
          !doc.payload.serviceWindows.some(
            (w) =>
              w.start <
                Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1) &&
              (w.end ?? doc.payload.issuer.validUntil) > month.getTime(),
          )
        )
          continue;
        if (!doc.payload.invoices.some((i) => i.period === period))
          doc = await store.command(
            row.ownerId,
            doc.revision,
            { action: 'close-month', period },
            now,
            true,
          );
        const invoice = doc.payload.invoices.find((i) => i.period === period)!;
        if (invoice.state === 'open')
          await billing.collect(row.ownerId, invoice.id);
        await billing.reconcile(row.ownerId, invoice.id, true);
        processed++;
      }
    } catch {
      held++;
    } finally {
      await env.DB.prepare(
        `UPDATE sky_linux_service_documents SET updated_at=? WHERE id=?`,
      )
        .bind(now, row.id)
        .run();
    }
  }
  return { processed, held };
}
export default {
  async fetch() {
    return Response.json({
      service: 'sky-linux-billing-controller',
      publicExecution: false,
    });
  },
  async scheduled(
    _event: ScheduledController,
    env: Runtime,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      closeLinuxBillingMonths(env).then((result) => {
        if (result.held)
          console.error(
            'Sky Linux billing records held for reconciliation:',
            result.held,
          );
      }),
    );
  },
};
