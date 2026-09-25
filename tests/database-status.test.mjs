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
    readFileSync(new URL('../data/project-status.json', import.meta.url), 'utf8'),
  );
  const taskStatus = Object.fromEntries(
    project.tasks.map(({ id, status }) => [id, status]),
  );
  assert.equal(report.summary.boundaryCount, 6);
  assert.equal(report.summary.tableCount, 92);
  assert.equal(report.summary.sourceVerifiedCount, 6);
  assert.equal(report.summary.currentProductionReadbackCount, 0);
  assert.equal(taskStatus.SKY07, 'in_progress');
  assert.equal(taskStatus.WEB01, 'blocked');
  assert.equal(report.projectProgress.blocked, 5);
  assert.equal(
    report.boundaries.find(({ id }) => id === 'web-d1').deployment
      .deploymentStatus,
    'OWNER_ACCESS_BLOCKED',
  );
  assert.equal(report.webSchema.tableCount, 32);
  assert.equal(report.webSchema.accidentalDuplicateCount, 0);
  assert.equal(report.webSchema.marketplaceRelationGuardCount, 8);
  assert.deepEqual(
    report.webSchema.domains.map(({ id, tableCount }) => [id, tableCount]),
    [
      ['core', 8],
      ['sky', 10],
      ['marketplace', 7],
      ['csv', 4],
      ['business', 3],
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
