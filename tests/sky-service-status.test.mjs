import assert from 'node:assert/strict';
import test from 'node:test';
import { skyServiceStatus, parseSkyServiceStatus } from '../lib/sky-service-status.ts';
import { skyToolUiState } from '../lib/sky-tool-ui.ts';
import { catalog } from '../lib/catalog.ts';

const origin = 'https://sky.example.com';
const tool = (id) => catalog.find((entry) => entry.id === id);
const configured = {
  DB: {}, BUCKET: {}, SKY_REMOTE_LLM_ENABLED: 'true',
  OPENAI_API_KEY: 'synthetic-openai-key', AI_GATEWAY_API_KEY: 'synthetic-gateway-key',
  SKY_PAYMENTS_MODE: 'test', SKY_STRIPE_SECRET_KEY: 'sk_test_synthetic',
  SKY_STRIPE_WEBHOOK_SECRET: 'whsec_synthetic', SKY_PAYMENT_ORIGIN: origin,
};

void test('empty public deployment reports missing providers without claiming the database is ready', () => {
  assert.deepEqual(skyServiceStatus({}, false, origin), {
    version: 1, database: 'unavailable', csvStorageConfigured: false,
    legalAiConfigured: false, patentAiConfigured: false, jevConfigured: false, payments: 'unconfigured', csvPayments: 'unconfigured',
  });
});

void test('key presence cannot override disabled external processing', () => {
  const result = skyServiceStatus({ ...configured, SKY_REMOTE_LLM_ENABLED: 'false' }, true, origin);
  assert.equal(result.legalAiConfigured, false);
  assert.equal(result.patentAiConfigured, false);
  assert.equal(result.jevConfigured, false);
  assert.equal(skyServiceStatus({ ...configured, OPENAI_API_KEY: '  ' }, true, origin).legalAiConfigured, false);
  const priceGateClosed = skyServiceStatus(configured, true, origin);
  assert.equal(priceGateClosed.legalAiConfigured, false);
  assert.equal(priceGateClosed.patentAiConfigured, false);
  assert.equal(priceGateClosed.jevConfigured, false);
});

void test('payment mode, key, webhook and origin must all match', () => {
  assert.equal(skyServiceStatus(configured, true, origin).payments, 'test');
  for (const overrides of [{ SKY_STRIPE_SECRET_KEY: 'sk_live_synthetic' }, { SKY_STRIPE_WEBHOOK_SECRET: '' }, { SKY_PAYMENT_ORIGIN: 'https://foreign.example' }, { SKY_PAYMENT_ORIGIN: origin + '/path' }])
    assert.equal(skyServiceStatus({ ...configured, ...overrides }, true, origin).payments, 'unconfigured');
});

void test('CSV payment configuration is independent of marketplace payments and needs its own webhook and storage', () => {
  const csvOnly = { ...configured, SKY_STRIPE_WEBHOOK_SECRET: undefined, SKY_CSV_STRIPE_WEBHOOK_SECRET: 'whsec_csvfixture' };
  assert.equal(skyServiceStatus(csvOnly, true, origin).csvPayments, 'test');
  assert.equal(skyServiceStatus(csvOnly, true, origin).payments, 'unconfigured');
  assert.equal(skyServiceStatus(configured, true, origin).csvPayments, 'unconfigured');
  const live = { ...csvOnly, SKY_PAYMENTS_MODE: 'live', SKY_STRIPE_SECRET_KEY: 'sk_live_synthetic' };
  assert.equal(skyServiceStatus(live, true, origin).csvPayments, 'live');
  for (const overrides of [
    { SKY_CSV_STRIPE_WEBHOOK_SECRET: '' }, { SKY_CSV_STRIPE_WEBHOOK_SECRET: 'invalid' },
    { SKY_STRIPE_SECRET_KEY: 'sk_test_synthetic' }, { SKY_PAYMENT_ORIGIN: 'https://foreign.example' },
    { DB: undefined }, { BUCKET: undefined },
  ]) assert.equal(skyServiceStatus({ ...live, ...overrides }, true, origin).csvPayments, 'unconfigured');
  assert.equal(skyServiceStatus(live, false, origin).csvPayments, 'unconfigured');
});

void test('the public status has no credentials, origin or user identity', () => {
  const result = skyServiceStatus({ ...configured, userId: 'synthetic-user' }, true, origin);
  const serialized = JSON.stringify(result);
  for (const secret of ['synthetic', 'OPENAI_API_KEY', 'SKY_STRIPE', origin, 'userId']) assert.ok(!serialized.includes(secret));
  assert.deepEqual(Object.keys(result).sort(), ['version', 'database', 'csvStorageConfigured', 'legalAiConfigured', 'patentAiConfigured', 'jevConfigured', 'payments', 'csvPayments'].sort());
});

void test('malformed status responses leave configuration unknown rather than enabling a tool', () => {
  const valid = skyServiceStatus(configured, true, origin);
  for (const bad of [null, [], {}, { ...valid, version: 2 }, { ...valid, database: 'healthy' }, { ...valid, database: { toString: 'available' } }, { ...valid, payments: ['live'] }, { ...valid, csvPayments: 'ready' }, { ...valid, csvPayments: ['live'] }, { ...valid, csvStorageConfigured: 'true' }, { ...valid, payments: 'ready' }]) assert.equal(parseSkyServiceStatus(bad), undefined);
  assert.deepEqual(parseSkyServiceStatus({ ...valid, secret: 'discard-me' }), valid);
  const { csvPayments: _csvPayments, ...legacy } = valid;
  assert.deepEqual(parseSkyServiceStatus(legacy), { ...legacy, csvPayments: 'unconfigured' });
});

void test('AI-guided tools retain their standard guide while provider configuration is missing', () => {
  const service = skyServiceStatus({}, true, origin);
  for (const id of ['rockstar-legal-intake', 'rockstar-patent-assistant']) {
    assert.equal(skyToolUiState(tool(id), { service }).label, '標準ガイドのみ・価格確認待ち');
    assert.match(skyToolUiState(tool(id), { service: skyServiceStatus(configured, true, origin) }).label, /価格/);
  }
});

void test('CSV needs database and object storage, whereas browser tools are blocked on explicit record-service failure', () => {
  const csv = tool('rockstar-csv-cleanup');
  assert.equal(skyToolUiState(csv).label, '利用条件を確認');
  assert.equal(skyToolUiState(csv, { service: skyServiceStatus({}, true, origin) }).label, 'ファイルサービス接続待ち');
  assert.equal(skyToolUiState(csv, { service: skyServiceStatus(configured, true, origin) }).label, 'サインインして利用');
  assert.equal(skyToolUiState(csv, { service: skyServiceStatus(configured, false, origin) }).label, 'ファイルサービス接続待ち');
  assert.equal(skyToolUiState(tool('mr-citations'), { service: skyServiceStatus({}, false, origin) }).className, 'is-connect');
  const candidate = tool('faster-whisper');
  assert.equal(skyToolUiState(candidate, { service: skyServiceStatus(configured, true, origin) }).label, '導入候補・本体未接続');
});
