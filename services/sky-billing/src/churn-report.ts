import {
  CHURN_ARMS,
  cohortChurn,
  type ChurnSubscription,
} from '../../../lib/churn-cohort.ts';

const MIN_PEOPLE = 5;
type PaidSubscription = ChurnSubscription & { userId: string };

function parsePrices(config: string | undefined) {
  const value: unknown = JSON.parse(config ?? '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CHURN_ARMS_INVALID');
  }
  const entries = Object.entries(value);
  if (
    entries.some(([price, arm]) => !/^price_[A-Za-z0-9_]+$/u.test(price) || (arm !== 'esim' && arm !== 'card')) ||
    !CHURN_ARMS.every((arm) => entries.some(([, mapped]) => mapped === arm))
  ) {
    throw new Error('CHURN_ARMS_INVALID');
  }
  return JSON.stringify(value);
}

async function readChurnSubscriptions(db: D1Database, prices: string, asOf: number) {
  const cutoff = Math.floor(asOf / 1000);
  const { results } = await db.prepare(
    `WITH paid_subscriptions AS (
      SELECT p.value AS arm, s.user_id AS userId,
        MIN(i.paid_at) * 1000 AS startedAt, COUNT(*) AS periodsPaid,
        CASE WHEN s.status = 'canceled'
          AND COALESCE(s.ended_at, s.stripe_event_created_at) <= ?2
          THEN COALESCE(s.ended_at, s.stripe_event_created_at) * 1000
        END AS endedAt
      FROM json_each(?1) AS p
      JOIN billing_subscriptions AS s ON s.price_id = p.key
      JOIN billing_invoices AS i
        ON i.stripe_subscription_id = s.stripe_subscription_id AND i.user_id = s.user_id
      WHERE i.status = 'paid' AND i.amount_paid > 0 AND i.paid_at BETWEEN 0 AND ?2
      GROUP BY s.stripe_subscription_id
    )
    SELECT arm, userId, startedAt, periodsPaid, endedAt FROM paid_subscriptions
    WHERE endedAt IS NULL OR endedAt >= startedAt`,
  ).bind(prices, cutoff).all<PaidSubscription>();
  return results;
}

export async function readChurnReport(db: D1Database, config: string | undefined, asOf: number) {
  const paid = await readChurnSubscriptions(db, parsePrices(config), asOf);
  const people = { esim: new Set<string>(), card: new Set<string>() };
  for (const { arm, userId } of paid) people[arm].add(userId);
  // Cohort observations are per contract. Suppress even if repeated contracts
  // would meet the threshold while the number of distinct people does not.
  const visible = paid.filter(({ arm }) => people[arm].size >= MIN_PEOPLE);
  return cohortChurn(visible, asOf, { minPeople: MIN_PEOPLE });
}
