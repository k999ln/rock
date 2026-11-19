import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const index = process.argv.indexOf('--project');
assert.ok(index >= 0 && process.argv[index + 1], '--project required');
const root = resolve(process.argv[index + 1]);
const state = mkdtempSync(join(tmpdir(), 'eve-shared-budget-d1-'));
const load = p => import(pathToFileURL(join(root, p)));
const sha = value => createHash('sha256').update(value).digest('hex');
const paths = ['lib/remote-ai-text-store.ts', 'lib/remote-ai-text-pricing.ts',
  'lib/remote-ai-rate-card.ts', 'lib/remote-ai-rate-card-store.ts',
  'lib/remote-ai-text-execution.ts', 'lib/remote-ai-text-input.ts', 'lib/llm-providers.ts',
  'drizzle-main/0021_sites_schema_convergence.sql'];
const hashes = () => Object.fromEntries(paths.map(p => [p, sha(readFileSync(join(root, p)))]));
const sourceSha256 = hashes();
const { sourceSandboxRestoreStatements } = await load('scripts/sky-monthly-sandbox-db.mjs');
const { RemoteAiTextStore } = await load('lib/remote-ai-text-store.ts');
const { prepareRemoteAiTextQuote } = await load('lib/remote-ai-text-pricing.ts');
const { REMOTE_AI_TEXT_RATE_CARD_SCHEMA, remoteAiRateCardSigningBytes, verifyRemoteAiRateCard } = await load('lib/remote-ai-rate-card.ts');
const { RemoteAiRateCardStore } = await load('lib/remote-ai-rate-card-store.ts');
const { workStore } = await load('lib/work-store.ts');
const { createWorkJob } = await load('lib/workflow.ts');
const { encryptRemoteAiTextInput } = await load('lib/remote-ai-text-input.ts');
const { executeReservedRemoteAiText } = await load('lib/remote-ai-text-execution.ts');
const { generateText } = await load('lib/llm-providers.ts');
const runtime = () => new Miniflare(convertV4MiniflareOptions({ resourcePersistencePath: join(state, 'db'), workers: [{
  name: 'budget-fixture', rootPath: state, modules: [{ type: 'ESModule', path: join(state, 'worker.mjs') }],
  compatibilityDate: '2026-01-01', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'eve-budget-fixture' },
  outboundService: () => { throw new Error('External network forbidden'); },
}] }));
writeFileSync(join(state, 'worker.mjs'), 'export default {fetch(){return new Response("fixture")}}');
let mf = runtime();
try {
  let db = await mf.getD1Database('DB', 'budget-fixture');
  for (const sql of sourceSandboxRestoreStatements()) await db.prepare(sql).run();
  const owner = 'synthetic-budget-owner', parent = createWorkJob({ id: randomUUID(), templateId: 'article', title: 'Synthetic shared budget' });
  await workStore(db).create(owner, parent);
  const now = Date.now(), pair = generateKeyPairSync('ed25519');
  const card = { schema: REMOTE_AI_TEXT_RATE_CARD_SCHEMA, providerId: 'openai', keyId: 'fixture-key',
    cardId: 'fixture-card', modelId: 'fixture-model', pricingVersion: 'fixture-prices', currency: 'USD',
    inputMinorMicrosPerMillionTokens: 1_000_000_000, outputMinorMicrosPerMillionTokens: 1_000_000_000,
    cachedInputMinorMicrosPerMillionTokens: 100_000_000, cacheWriteMinorMicrosPerMillionTokens: 2_000_000_000,
    executionScope: 'text-only', serviceTier: 'default', effectiveAt: now - 1000,
    expiresAt: now + 600_000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', signature: '' };
  card.signature = sign(null, remoteAiRateCardSigningBytes(card), pair.privateKey).toString('base64url');
  const verified = await verifyRemoteAiRateCard(card, { providerId: 'openai', modelId: 'fixture-model', currency: 'USD' },
    async () => Uint8Array.from(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)), now);
  await new RemoteAiRateCardStore(db).register(verified, 'synthetic-operator', now);
  let store = new RemoteAiTextStore(db);
  async function quote(cap = 1) {
    const prepared = await prepareRemoteAiTextQuote(verified, { ownerId: owner, requestId: randomUUID(), model: 'fixture-model',
      prompt: 'Synthetic input', maxOutputTokens: 100, maximumBudgetMinor: 1 });
    return (await store.create(prepared, verified, parent.id, cap)).record;
  }
  const pool = () => db.prepare('SELECT reserved_minor,settled_minor,budget_limit_minor FROM agent_delegation_budget_pools WHERE owner_user_id=? AND parent_job_id=?').bind(owner, parent.id).first();
  const a = await quote(), b = await quote();
  const race = await Promise.allSettled([a, b].map(q => store.reserve(owner, q.id, q.approvalDigest)));
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(race.find(r => r.status === 'rejected').reason.code, 'BUDGET_UNAVAILABLE');
  assert.deepEqual(await pool(), { reserved_minor: 1, settled_minor: 0, budget_limit_minor: 1 });
  const winner = race[0].status === 'fulfilled' ? a : b;
  assert.equal(await store.get('foreign-owner', winner.id), null);
  const capChange = await quote(2);
  await assert.rejects(store.reserve(owner, capChange.id, capChange.approvalDigest), e => e.code === 'BUDGET_UNAVAILABLE');
  await mf.dispose(); mf = runtime(); db = await mf.getD1Database('DB', 'budget-fixture'); store = new RemoteAiTextStore(db);
  assert.equal((await store.get(owner, winner.id)).state, 'reserved');
  assert.deepEqual(await pool(), { reserved_minor: 1, settled_minor: 0, budget_limit_minor: 1 });
  await store.cancelBeforeSend(owner, winner.id, winner.approvalDigest);
  await store.cancelBeforeSend(owner, winner.id, winner.approvalDigest);
  assert.equal((await pool()).reserved_minor, 0);
  const c = await quote(), delegation = randomUUID();
  const mixed = await Promise.allSettled([
    store.reserve(owner, c.id, c.approvalDigest),
    db.prepare(`INSERT INTO agent_delegation_budget_reservations
      (delegation_id,owner_user_id,parent_job_id,currency,reserved_minor,state,created_at,updated_at)
      VALUES (?,?,?,'USD',1,'held',?,?)`).bind(delegation, owner, parent.id, now, now).run(),
  ]);
  assert.equal(mixed.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await pool()).reserved_minor, 1);
  const beforeRestart = await pool();
  await mf.dispose(); mf = runtime(); db = await mf.getD1Database('DB', 'budget-fixture');
  assert.deepEqual(await pool(), beforeRestart);
  store = new RemoteAiTextStore(db);
  const uncertainParent = createWorkJob({ id: randomUUID(), templateId: 'article', title: 'Synthetic uncertain dispatch' });
  await workStore(db).create(owner, uncertainParent);
  const intent = { ownerId: owner, requestId: randomUUID(), model: 'fixture-model', prompt: 'Synthetic uncertain input',
    maxOutputTokens: 100, maximumBudgetMinor: 1 };
  const uncertain = (await store.create(await prepareRemoteAiTextQuote(verified, intent), verified, uncertainParent.id, 1)).record;
  await store.reserve(owner, uncertain.id, uncertain.approvalDigest);
  await store.saveInput(owner, uncertain.id, uncertain.approvalDigest,
    await encryptRemoteAiTextInput(intent, 'a'.repeat(64), owner, uncertain.id));
  let simulatedSubmissions = 0;
  const request = () => executeReservedRemoteAiText({ store, ownerId: owner, id: uncertain.id,
    approvalDigest: uncertain.approvalDigest, intent, verified, runtimeEnv: { OPENAI_API_KEY: 'fixture-only' },
    fetchImpl: async () => { simulatedSubmissions++; throw new DOMException('Synthetic timeout', 'AbortError'); } });
  await assert.rejects(request(), e => e.code === 'UPSTREAM_TIMEOUT');
  const unknown = await store.get(owner, uncertain.id);
  assert.equal(unknown.state, 'unreconciled'); assert.equal(unknown.usage, null);
  await assert.rejects(store.cancelBeforeSend(owner, uncertain.id, uncertain.approvalDigest), e => e.code === 'INVALID_STATE');
  await store.expireBeforeSend(owner, uncertain.id, uncertain.quote.expiresAt + 10_000_000);
  assert.equal((await store.get(owner, uncertain.id)).state, 'unreconciled');
  const uncertainPool = () => db.prepare('SELECT reserved_minor,settled_minor,budget_limit_minor FROM agent_delegation_budget_pools WHERE owner_user_id=? AND parent_job_id=?').bind(owner, uncertainParent.id).first();
  assert.deepEqual(await uncertainPool(), { reserved_minor: 1, settled_minor: 0, budget_limit_minor: 1 });
  await mf.dispose(); mf = runtime(); db = await mf.getD1Database('DB', 'budget-fixture'); store = new RemoteAiTextStore(db);
  assert.deepEqual(await store.get(owner, uncertain.id), unknown);
  assert.equal((await request()).providerSubmission, 'not_repeated'); assert.equal(simulatedSubmissions, 1);
  // Synthetic late result exercises storage settlement, not a provider reconciliation API.
  const result = await generateText({ provider: 'openai', model: intent.model, prompt: intent.prompt, maxOutputTokens: 100 },
    { OPENAI_API_KEY: 'fixture-only' }, async () => Response.json({ id: 'resp_synthetic_late', model: 'fixture-model',
      status: 'completed', service_tier: 'default', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 } },
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic result' }] }] }));
  await store.complete(owner, uncertain.id, verified, result);
  await store.complete(owner, uncertain.id, verified, result);
  assert.deepEqual(await uncertainPool(), { reserved_minor: 0, settled_minor: 1, budget_limit_minor: 1 });
  assert.equal((await request()).providerSubmission, 'not_repeated'); assert.equal(simulatedSubmissions, 1);
  await mf.dispose(); mf = runtime(); db = await mf.getD1Database('DB', 'budget-fixture'); store = new RemoteAiTextStore(db);
  assert.equal((await store.get(owner, uncertain.id)).state, 'completed');
  assert.deepEqual(await uncertainPool(), { reserved_minor: 0, settled_minor: 1, budget_limit_minor: 1 });
  assert.deepEqual(hashes(), sourceSha256);
  const proof = { status: 'passed', scope: 'Source store methods against persistent local D1 and restored synthetic schema; A2A reservation SQL, not external A2A execution',
    sourceSha256, concurrentCloudReservations: { fulfilled: 1, rejectedBudgetUnavailable: 1 },
    mixedCloudA2AReservations: { fulfilled: 1, rejected: 1, winner: mixed[0].status === 'fulfilled' ? 'cloud' : 'a2a' },
    capIncreaseRejected: true, foreignOwnerReadRejected: true, preSendCancelReplayReleasesOnce: true,
    restarts: 4, uncertainDispatch: { simulatedSubmissions, cancelRejected: true, expiryDoesNotRelease: true, unknownUsagePreserved: true, restartExact: true, retryNotSent: true, syntheticLateSettlementAppliedOnce: true, settledPool: await uncertainPool() }, reservationPreserved: true, finalPool: beforeRestart,
    externalCalls: 0, actualCharges: false, providerInvoiceReconciled: false, publicDeployment: false, state };
  writeFileSync(join(state, 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
} finally { await mf.dispose(); }
