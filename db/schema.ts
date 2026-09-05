import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const fundPlans = sqliteTable('fund_plans', {
  userId:text('user_id').primaryKey(), plan:text('plan').notNull(), updatedAt:text('updated_at').notNull(),
});
export const toolRuns = sqliteTable('tool_runs', {
  id:text('id').primaryKey(), userId:text('user_id').notNull(), tool:text('tool').notNull(),
  sample:integer('sample',{mode:'boolean'}).notNull().default(false), transport:text('transport').notNull(), status:text('status').notNull(), durationMs:integer('duration_ms').notNull(), createdAt:text('created_at').notNull(),
},table=>[index('idx_tool_runs_user_created').on(table.userId,table.createdAt)]);
export const workJobs = sqliteTable('work_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
}, table => [index('idx_work_jobs_user_updated').on(table.userId, table.updatedAt)]);
