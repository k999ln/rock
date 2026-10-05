import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildDatabaseStatus,
  renderDatabaseStatus,
  serializeDatabaseStatus,
} from '../scripts/database-status.mjs';

void test('database status inventories every boundary and keeps production readback explicit', () => {
  const report = buildDatabaseStatus();
  const project = JSON.parse(
    readFileSync(
      new URL('../data/project-status.json', import.meta.url),
      'utf8',
    ),
  );
  const taskStatus = Object.fromEntries(
    project.tasks.map(({ id, status }) => [id, status]),
  );
  assert.equal(report.summary.boundaryCount, 6);
  assert.equal(report.summary.tableCount, 149);
  assert.equal(report.summary.sourceVerifiedCount, 6);
  assert.equal(report.summary.currentProductionReadbackCount, 0);
  assert.equal(taskStatus.SKY07, 'in_progress');
  assert.equal(taskStatus.WEB01, 'blocked');
  assert.equal(report.projectProgress.blocked, 1);
  assert.equal(
    report.boundaries.find(({ id }) => id === 'web-d1').deployment
      .deploymentStatus,
    'OWNER_ACCESS_BLOCKED',
  );
  assert.equal(report.webSchema.tableCount, 77);
  assert.equal(report.webSchema.migrationCount, 60);
  assert.ok(report.webSchema.tables.includes('sky_library_items'));
  assert.ok(report.webSchema.tables.includes('rockstar_entitlement_events'));
  assert.ok(report.webSchema.tables.includes('remote_ai_rate_cards'));
  assert.ok(report.webSchema.tables.includes('remote_ai_text_executions'));
  assert.ok(report.webSchema.tables.includes('remote_ai_text_inputs'));
  assert.ok(report.webSchema.tables.includes('remote_ai_text_send_claims'));
  assert.ok(report.webSchema.tables.includes('a2a_live_usage_snapshots'));
  assert.ok(report.webSchema.tables.includes('a2a_price_quote_consent_events'));
  assert.ok(report.webSchema.tables.includes('sky_package_runtime_bindings'));
  assert.ok(report.webSchema.tables.includes('rockstar_device_authorizations'));
  assert.ok(report.webSchema.tables.includes('rockstar_device_sessions'));
  assert.equal(report.webSchema.latestMigration, '0059_sky_library.sql');
  assert.equal(report.webSchema.accidentalDuplicateCount, 0);
  assert.equal(report.webSchema.marketplaceRelationGuardCount, 8);
  assert.deepEqual(
    report.webSchema.domains.map(({ id, tableCount }) => [id, tableCount]),
    [
      ['core', 12],
      ['sky', 33],
      ['marketplace', 7],
      ['csv', 5],
      ['business', 20],
    ],
  );
  assert.equal(
    report.boundaries.flatMap(({ tables }) => tables).length,
    report.summary.tableCount,
  );
});

void test('generated database status files match their canonical inputs', () => {
  const report = buildDatabaseStatus();
  assert.equal(
    readFileSync(
      new URL('../data/database-status.json', import.meta.url),
      'utf8',
    ),
    serializeDatabaseStatus(report),
  );
  assert.equal(
    readFileSync(
      new URL('../docs/database-status.md', import.meta.url),
      'utf8',
    ),
    renderDatabaseStatus(report),
  );
});
