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
  assert.equal(report.summary.tableCount, 263);
  for (const table of ['distribution_assignments','distribution_lots','distribution_addresses','distribution_plans','distribution_occurrences']) {
    assert.deepEqual(report.boundaries.filter(boundary=>boundary.tables.includes(table)).map(b=>b.id),['operator-dock-d1'],table);
  }
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
  assert.equal(report.webSchema.tableCount, 186);
  assert.equal(report.webSchema.migrationCount, 44);
  for (const name of ['cloud_usage_records', 'cloud_admission_probes', 'cloud_execution_timings']) {
    assert.ok(report.webSchema.tables.includes(name), name);
  }
  assert.ok(report.webSchema.tables.includes('sim_bindings'));
  assert.ok(report.webSchema.tables.includes('noah_agent_availability'));
  assert.ok(report.webSchema.tables.includes('noah_first_earnings'));
  assert.ok(report.webSchema.tables.includes('noah_first_earning_runs'));
  for (const name of ['noah_compute_devices', 'noah_compute_jobs', 'noah_compute_delegation_fences', 'noah_compute_subscriptions']) {
    assert.deepEqual(report.boundaries.filter(boundary => boundary.tables.includes(name)).map(boundary => boundary.id), ['web-d1'], name);
    assert.ok(report.webSchema.tables.includes(name), name);
  }
  assert.ok(report.webSchema.tables.includes('esim_go_profile_status_events'));
  assert.ok(report.webSchema.tables.includes('esim_ios_install_declarations'));
  for (const name of ['sky_linux_service_documents','sky_linux_service_receipts','rockstar_service_setups']) { assert.ok(report.webSchema.tables.includes(name)); assert.ok(report.webSchema.sourceOnlyTables.includes(name)); }
  assert.ok(report.webSchema.tables.includes('sky_library_items'));
  assert.ok(report.webSchema.tables.includes('eve_runtime_presence'));
  for (const name of ['noah_agent_uploads', 'noah_instances', 'noah_runner_devices', 'noah_runner_commands', 'noah_intake_sources', 'noah_intake_candidates', 'noah_intake_checks', 'noah_intake_families', 'noah_probe_hosts']) assert.ok(report.webSchema.tables.includes(name), name);
  for (const name of ['noah_agent_comments', 'noah_agent_crowns', 'noah_maintenance_requests']) assert.ok(report.webSchema.tables.includes(name), name);
  assert.ok(report.webSchema.tables.includes('sky_feed_history_events'));
  assert.ok(
    report.webSchema.tables.includes('sky_feed_personalization_settings'),
  );
  assert.ok(report.webSchema.tables.includes('esim_cloud_access_keys'));
  assert.ok(report.webSchema.tables.includes('sky_code_repositories'));
  assert.ok(report.webSchema.tables.includes('sky_code_commits'));
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
  assert.ok(report.webSchema.tables.includes('jennifer_plan_revisions'));
  assert.ok(report.webSchema.tables.includes('jennifer_task_attempts'));
  assert.ok(report.webSchema.tables.includes('jennifer_passkey_credentials'));
  assert.ok(report.webSchema.tables.includes('jennifer_passkey_sessions'));
  assert.equal(report.webSchema.latestMigration, '0063_noah_compute_subscriptions.sql');
  assert.equal(report.webSchema.accidentalDuplicateCount, 0);
  assert.equal(report.webSchema.publishedConvergenceDeclarations, 25);
  assert.equal(report.webSchema.marketplaceRelationGuardCount, 8);
  assert.deepEqual(
    report.webSchema.domains.map(({ id, tableCount }) => [id, tableCount]),
    [
      ['core', 33],
      ['sky', 116],
      ['marketplace', 7],
      ['csv', 5],
      ['business', 25],
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
