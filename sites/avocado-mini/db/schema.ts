import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const preorderStock = sqliteTable('preorder_stock', {
  sku: text('sku').primaryKey(),
  capacity: integer('capacity').notNull(),
  reserved: integer('reserved').notNull().default(0),
});

export const preorders = sqliteTable('preorders', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull(),
  amountJpy: integer('amount_jpy').notNull(),
  termsSnapshotJson: text('terms_snapshot_json').notNull(),
  termsVersion: text('terms_version'),
  termsAcceptedAt: integer('terms_accepted_at'),
  status: text('status').notNull(),
  stripeSessionId: text('stripe_session_id').unique(),
  stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
  stripeExpiresAt: integer('stripe_expires_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  paidAt: integer('paid_at'),
});

export const preorderEvents = sqliteTable('preorder_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  orderId: text('order_id'),
  createdAt: integer('created_at').notNull(),
});

export const preorderAttempts = sqliteTable('preorder_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  createdAt: integer('created_at').notNull().default(0),
});
