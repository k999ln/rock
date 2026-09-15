import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';
import { parseSkySubmission } from '../lib/sky-submission.ts';
import { loadConfig } from '../toolkits/fashion-brand-ops/src/config.mjs';
import { TOOL_DEFINITIONS } from '../toolkits/fashion-brand-ops/src/tools.mjs';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL(
  'toolkits/fashion-brand-ops/rockstaros-tool.json',
  root,
);
const manifestBytes = readFileSync(manifestUrl);
const manifest = JSON.parse(manifestBytes);
const skySubmission = JSON.parse(
  readFileSync(
    new URL('toolkits/fashion-brand-ops/sky-submission.json', root),
    'utf8',
  ),
);

void test('RockstarOS Sky lists Fashion Brand Ops as a ready MCP product', () => {
  const item = catalog.find((tool) => tool.id === 'fashion-brand-ops');
  assert.ok(item);
  assert.equal(item.status, 'ready');
  assert.equal(item.integration, 'fashion-brand-ops');
  assert.match(item.name, /Instagram運用/);
  assert.equal(item.category, 'ブランド運営');
  assert.match(item.environment, /MCP/);
  assert.match(item.note, /承認/);
});

void test('Sky accepts the Fashion Brand Ops listing contract', () => {
  const parsed = parseSkySubmission(skySubmission);
  assert.equal(parsed.name, 'Instagram運用・受注型ブランド管理');
  assert.equal(parsed.connectionType, 'mcp_stdio');
  assert.deepEqual(parsed.executionTargets, ['pc']);
  assert.ok(parsed.permissions.includes('financial_action'));
});

void test('the Sky manifest binds the MCP runtime and every dangerous effect to approval', () => {
  assert.equal(manifest.id, 'org.rockstar.fashion-brand-ops');
  assert.equal(manifest.runtime.kind, 'local_mcp');
  assert.deepEqual(manifest.runtime.transports, ['stdio', 'streamable_http']);
  assert.equal(manifest.data.credentials, 'references_only');
  assert.equal(manifest.commercial.liveBilling, false);
  for (const capability of [
    'producer.start',
    'instagram.accounts',
    'instagram.screenshot_intake',
    'instagram.content_plan',
    'instagram.draft',
    'instagram.schedule',
    'instagram.publish',
    'instagram.insights',
    'instagram.dm.classify',
    'campaign.autopilot',
    'sales.concierge',
    'production.cockpit',
    'executive.dashboard',
  ]) {
    assert.ok(manifest.capabilities.includes(capability), capability);
  }
  const expected = [
    'product.price_change',
    'creative.generate',
    'social.schedule',
    'social.publish',
    'social.create_ad',
    'dm.reply',
    'payment.create_link',
    'payment.send_invoice',
    'payment.refund',
    'notification.send',
  ];
  assert.deepEqual(manifest.approval.requiredFor, expected);
  assert.equal(manifest.approval.unknownOutcome, 'reconciliation_required');
});

void test('MCP discovery exposes the complete fashion workflow and receipts bind the manifest digest', () => {
  assert.equal(TOOL_DEFINITIONS.length, 40);
  assert.ok(
    TOOL_DEFINITIONS.some((tool) => tool.name === 'fashion.payment.status.get'),
  );
  assert.ok(
    !TOOL_DEFINITIONS.some(
      (tool) => tool.name === 'fashion.payment.event.process',
    ),
  );
  for (const name of [
    'fashion.producer.start',
    'fashion.brand.upsert',
    'fashion.market.analyze',
    'fashion.creative.prepare',
    'instagram.accounts.list',
    'instagram.accounts.intake_screenshots',
    'instagram.accounts.candidates.list',
    'instagram.accounts.switch',
    'instagram.content_plan.create',
    'instagram.draft.create',
    'instagram.schedule.prepare',
    'instagram.publish.prepare',
    'instagram.insights.sync',
    'instagram.dm.classify',
    'fashion.payment.prepare',
    'fashion.feedback.build',
    'fashion.autopilot.goal.create',
    'fashion.autopilot.tick',
    'fashion.autopilot.run',
    'fashion.concierge.prepare',
    'fashion.sales.pipeline.get',
    'fashion.production.plan',
    'fashion.production.dashboard',
    'fashion.executive.dashboard',
    'fashion.system.readiness',
    'approval.execute',
  ]) {
    assert.ok(
      TOOL_DEFINITIONS.some((tool) => tool.name === name),
      name,
    );
  }
  const digest = createHash('sha256').update(manifestBytes).digest('hex');
  assert.equal(loadConfig({}).packageDigest, digest);
});
