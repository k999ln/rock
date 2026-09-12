import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const fundPlans = sqliteTable('fund_plans', {
  userId: text('user_id').primaryKey(),
  plan: text('plan').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const toolRuns = sqliteTable(
  'tool_runs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    sample: integer('sample', { mode: 'boolean' }).notNull().default(false),
    transport: text('transport').notNull(),
    status: text('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_tool_runs_user_created').on(table.userId, table.createdAt),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    transport: text('transport').notNull(),
    sample: integer('sample').notNull(),
    status: text('status').notNull(),
    inputBytes: integer('input_bytes').notNull(),
    outputBytes: integer('output_bytes'),
    durationMs: integer('duration_ms'),
    errorCode: text('error_code'),
    deviceId: text('device_id'),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    deadline: integer('deadline').notNull(),
  },
  (table) => [
    index('idx_jobs_user_created').on(table.userId, table.createdAt),
    uniqueIndex('idx_jobs_one_active_user')
      .on(table.userId)
      .where(sql`${table.status} IN ('queued', 'running')`),
  ],
);
export const jobEvents = sqliteTable(
  'job_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_events_job_status').on(table.jobId, table.status),
    index('idx_events_user').on(table.userId, table.id),
  ],
);
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_devices_user_seen').on(table.userId, table.lastSeenAt),
  ],
);
export const toolControls = sqliteTable(
  'tool_controls',
  {
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    enabled: integer('enabled').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_controls_user_tool').on(table.userId, table.tool),
  ],
);
export const bookRecords = sqliteTable(
  'book_records',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    amount: integer('amount').notNull(),
    source: text('source').notNull(),
    occurredOn: text('occurred_on').notNull(),
    reversesId: text('reverses_id'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_book_user_created').on(table.userId, table.createdAt),
    uniqueIndex('idx_book_reversal').on(table.reversesId),
  ],
);

export const workJobs = sqliteTable(
  'work_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    payload: text('payload').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_work_jobs_user_updated').on(table.userId, table.updatedAt),
  ],
);

export const skyToolSubmissions = sqliteTable(
  'sky_tool_submissions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    payload: text('payload').notNull(),
    status: text('status').notNull().default('submitted'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_sky_submissions_user_created').on(table.userId, table.createdAt),
  ],
);
