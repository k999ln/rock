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
  assert.equal(report.summary.boundaryCount, 6);
  assert.equal(report.summary.tableCount, 73);
  assert.equal(report.summary.sourceVerifiedCount, 6);
  assert.equal(report.summary.currentProductionReadbackCount, 0);
  assert.equal(report.webSchema.tableCount, 27);
  assert.equal(report.webSchema.accidentalDuplicateCount, 0);
  assert.equal(report.webSchema.marketplaceRelationGuardCount, 8);
  assert.deepEqual(
    report.webSchema.domains.map(({ id, tableCount }) => [id, tableCount]),
    [
      ['core', 8],
      ['sky', 5],
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
