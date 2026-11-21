-- Stripe Subscription.ended_at, as Unix seconds. Keep legacy rows readable.
ALTER TABLE billing_subscriptions ADD COLUMN ended_at INTEGER;
