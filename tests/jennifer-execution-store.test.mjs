import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import registrySource from '../data/jennifer-knowledge.json' with { type: 'json' };
import { createJenniferCoordinationPlan } from '../lib/jennifer-coordination.ts';
import { parseJenniferKnowledgeRegistry } from '../lib/jennifer-amc-decomposition.ts';
import {
  approveJenniferExecutionGoal,
  createJenniferExecutionGoal,
} from '../lib/jennifer-amc-execution.ts';
import { jenniferExecutionStore } from '../lib/jennifer-execution-store.ts';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob } from '../lib/workflow.ts';

function makeDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE work_jobs (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    payload text NOT NULL,
    revision integer NOT NULL,
    updated_at text NOT NULL
  )`);
  sqlite.exec(readFileSync(new URL('../drizzle/0014_jennifer_execution_integrity.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return sqlite.prepare(sql).get(...values) ?? null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
            runSync() {
              return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
            },
            async run() { return this.runSync(); },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, sqlite };
}

function plan() {
  return createJenniferCoordinationPlan(
    'Jenniferの実行台帳を安全に更新する',
    'request-store',
    {
      id: 'rockstaros-core',
      displayName: 'RockstarOS',
      managerAgentId: 'jennifer-os-manager',
      managerLabel: 'OS担当AI',
      sourceRefs: ['PROJECTS.md'],
    },
    parseJenniferKnowledgeRegistry(registrySource),
  );
}

void test('Jennifer creates the root Goal and first plan revision atomically and replays only the same intent', async (t) => {
  const { db } = makeDb(t);
  const owner = 'alice';
  const rootId = '00000000-0000-4000-8000-000000000011';
  const source = plan();
  const draft = createJenniferExecutionGoal(source, '2026-10-13T00:00:00.000Z', rootId);
  const root = {
    ...createWorkJob({ id: rootId, templateId: 'amc', importGoal: draft }, '2026-10-13T00:00:00.000Z'),
    amcCreationDigest: 'c'.repeat(64),
  };
  const store = jenniferExecutionStore(db);
  const first = await store.createPlanWithRoot({
    ownerUserId: owner, root, plan: source, planDigest: 'a'.repeat(64), now: 1,
  });
  assert.equal(first.root.id, rootId);
  assert.equal(first.plan.state, 'draft');
  const replay = await store.createPlanWithRoot({
    ownerUserId: owner, root: { ...root, createdAt: '2026-10-13T00:01:00.000Z' },
    plan: source, planDigest: 'a'.repeat(64), now: 2,
  });
  assert.equal(replay.root.createdAt, root.createdAt);

  const conflictingRoot = { ...root, id: '00000000-0000-4000-8000-000000000012' };
  await assert.rejects(() => store.createPlanWithRoot({
    ownerUserId: owner, root: conflictingRoot, plan: source,
    planDigest: 'a'.repeat(64), now: 3,
  }));
  assert.equal(await workStore(db).get(owner, conflictingRoot.id), null);
});

void test('Jennifer commits Goal and plan state together and rejects stale root revisions', async (t) => {
  const { db } = makeDb(t);
  const owner = 'alice';
  const rootId = '00000000-0000-4000-8000-000000000001';
  const source = plan();
  const draft = createJenniferExecutionGoal(source, '2026-10-13T00:00:00.000Z', rootId);
  const root = createWorkJob({ id: rootId, templateId: 'amc', importGoal: draft }, '2026-10-13T00:00:00.000Z');
  await workStore(db).create(owner, root);
  const store = jenniferExecutionStore(db);
  await store.createPlan({ ownerUserId: owner, rootJobId: rootId, plan: source, planDigest: 'a'.repeat(64), now: 1 });
  const resolutions = source.amc.goalContract.unresolvedQuestions.map((question) => ({
    question, disposition: 'deferred', note: 'inventoryで原本を確認する',
  }));
  const approvedGoal = approveJenniferExecutionGoal(draft, resolutions, `owner:${owner}`, '2026-10-13T00:01:00.000Z');
  const approvedRoot = { ...root, amcGoal: approvedGoal, revision: 1, updatedAt: '2026-10-13T00:01:00.000Z' };
  await store.commitStateWithRoot({
    ownerUserId: owner, root: approvedRoot, previousRootRevision: 0,
    planRevision: 1, from: ['draft'], to: 'inventory_approved',
    approvedBy: `owner:${owner}`, resolutions, now: 2,
  });
  assert.equal((await store.currentPlan(owner, rootId)).state, 'inventory_approved');
  assert.equal((await workStore(db).get(owner, rootId)).revision, 1);

  const staleRoot = { ...approvedRoot, revision: 2, updatedAt: '2026-10-13T00:02:00.000Z' };
  await assert.rejects(() => store.commitStateWithRoot({
    ownerUserId: owner, root: staleRoot, previousRootRevision: 0,
    planRevision: 1, from: ['inventory_approved'], to: 'paused', now: 3,
  }), /JENNIFER_PLAN_REVISION_CONFLICT/);
  assert.equal((await store.currentPlan(owner, rootId)).state, 'inventory_approved');
  assert.equal((await workStore(db).get(owner, rootId)).revision, 1);
});

void test('Jennifer permits one immutable attempt per task, role and plan revision', async (t) => {
  const { db } = makeDb(t);
  const store = jenniferExecutionStore(db);
  const base = {
    ownerUserId: 'alice', rootJobId: '00000000-0000-4000-8000-000000000001',
    planRevision: 1, taskId: 'task-inventory', role: 'worker',
    childJobId: '00000000-0000-4000-8000-000000000002',
    delegationId: '00000000-0000-4000-8000-000000000003',
    principal: 'https://agent.example|inventory-agent|1.0.0',
    inputDigest: 'b'.repeat(64), state: 'remote_completed', now: 1,
  };
  const first = await store.registerAttempt(base);
  assert.equal(first.delegationId, base.delegationId);
  await assert.rejects(() => store.registerAttempt({
    ...base,
    delegationId: '00000000-0000-4000-8000-000000000004',
  }), /JENNIFER_ATTEMPT_IDEMPOTENCY_CONFLICT/);
  assert.equal((await store.listAttempts(base.ownerUserId, base.rootJobId)).length, 1);
});
