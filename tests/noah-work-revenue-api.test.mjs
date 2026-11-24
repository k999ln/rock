import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, NOW } from './fixtures/noah/intake.mjs';
import { createNoahWorkRevenueApi } from '../lib/noah-work-revenue-api.ts';
import {
  noahRevenueConfig,
  noahRevenueReadContext,
  bindRevenueExecution,
  revenueDispatchMeta,
} from '../lib/noah-revenue-operation.ts';
import { createNoahRemoteWork } from '../lib/noah-remote-work.ts';
import { createReceiptSignature } from '../lib/receipt-signature.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { workStore } from '../lib/work-store.ts';

const origin = 'https://noah.example',
  combinationId = 'affiliate:ai-tools:blog';
const env = {
  NOAH_REVENUE_PROVIDER_ID: 'statement-issuer',
  NOAH_REVENUE_PROVIDER_SECRET: 'a'.repeat(40),
  NOAH_REVENUE_AUTHOR_OWNERS: '{"noellesugar99":"author-account"}',
  NOAH_REVENUE_OPERATOR_ACCOUNTS:
    '{"owner-a":"operator-a","owner-b":"operator-b"}',
  NOAH_REVENUE_PROVIDER_TARGET: JSON.stringify({
    familyKey: 'project-operator',
    endpoint: 'https://provider.example/mcp',
    tool: 'operate',
    combinationId,
  }),
};
const request = (route, body, headers = {}) =>
  new Request(origin + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
function setup(t) {
  const { db, sql } = fixture(t);
  const config = noahRevenueConfig(env);
  const api = createNoahWorkRevenueApi({
    db,
    authenticate: async (r) => r.headers.get('x-test-owner'),
    now: () => NOW + 1000,
    revenueConfig: config,
  });
  async function start(
    owner = 'owner-a',
    requestId = crypto.randomUUID(),
    extra = {},
  ) {
    return api.start(
      request(
        '/api/noah/revenue/work',
        { combinationId, requestId },
        {
          'x-test-owner': owner,
          origin,
          'X-Rock-Owner-Scope': await ownerScopeFor(owner),
          ...extra,
        },
      ),
    );
  }
  function envelope(workId, overrides = {}) {
    return {
      schema: 'noah-revenue-receipt/1',
      providerId: env.NOAH_REVENUE_PROVIDER_ID,
      workId,
      combinationId,
      version: 1,
      stage: 'approved',
      source: 'asp-approval',
      reference: 'approval-A',
      amountYen: 10000,
      currency: 'JPY',
      observedAt: NOW + 1000,
      evidenceSha256: 'c'.repeat(64),
      operatorRef: 'operator-a',
      ...overrides,
    };
  }
  async function post(e, signature) {
    return api.receipt(
      request('/api/noah/revenue/receipts', e, {
        'avocado-provider-signature':
          signature ??
          (await createReceiptSignature(
            JSON.stringify(e),
            env.NOAH_REVENUE_PROVIDER_SECRET,
            Math.floor((NOW + 1000) / 1000),
          )),
      }),
    );
  }
  return {
    db,
    sql,
    config,
    start,
    envelope,
    post,
    read: (owner, work) => workStore(db).get(owner, work),
  };
}
void test('tracking creates one owner-scoped Work per request and only signed evidence for that operator changes it', async (t) => {
  const h = setup(t),
    id = crypto.randomUUID();
  assert.equal(
    (await h.start('owner-a', id, { origin: 'https://other.example' })).status,
    403,
  );
  assert.equal(
    (
      await h.start('owner-a', id, {
        'X-Rock-Owner-Scope': await ownerScopeFor('owner-b'),
      })
    ).status,
    409,
  );
  const started = await h.start('owner-a', id);
  assert.equal(started.status, 201);
  const { workId, ownerScope } = await started.json();
  assert.equal(ownerScope, await ownerScopeFor('owner-a'));
  assert.equal((await (await h.start('owner-a', id)).json()).workId, workId);
  const bob = (await (await h.start('owner-b', id)).json()).workId;
  assert.notEqual(workId, bob);
  assert.equal(await h.read('owner-b', workId), null);
  assert.deepEqual((await h.read('owner-a', workId)).noahRevenue.receipts, []);
  const approved = h.envelope(workId);
  assert.equal((await h.post(approved, 'invalid')).status, 401);
  assert.equal((await h.post({ ...approved, currency: 'USD' })).status, 400);
  assert.equal(
    (await h.post({ ...approved, operatorRef: 'operator-b' })).status,
    404,
  );
  assert.equal((await h.post({ ...approved, version: 7 })).status, 409);
  assert.equal((await h.post({ ...approved, workId: bob })).status, 404);
  assert.equal((await h.post(approved)).status, 201);
  assert.equal((await h.post(approved)).status, 200);
  assert.equal((await h.post({ ...approved, amountYen: 10001 })).status, 409);
  assert.equal(
    (await h.post({ ...approved, workId: bob, operatorRef: 'operator-b' }))
      .status,
    409,
  );
  assert.equal(
    (
      await h.post({
        ...approved,
        workId: bob,
        operatorRef: 'operator-b',
        reference: 'alias-of-same-proof',
      })
    ).status,
    409,
  );
  assert.equal(
    (await h.post({ ...approved, reference: 'alias-of-same-proof' })).status,
    409,
  );
  assert.equal((await h.read('owner-b', bob)).noahRevenue.receipts.length, 0);
  assert.equal(
    (
      await h.post(
        h.envelope(workId, {
          stage: 'paid',
          source: 'bank-deposit',
          reference: 'bank-line-A',
        }),
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await h.post(
        h.envelope(workId, {
          stage: 'cost',
          source: 'final-work-cost',
          reference: 'final-all-costs',
          amountYen: 0,
        }),
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await h.post(
        h.envelope(workId, {
          stage: 'cost',
          source: 'final-work-cost',
          reference: 'second-final-cost',
          amountYen: 200,
        }),
      )
    ).status,
    409,
  );
  const job = await h.read('owner-a', workId);
  assert.deepEqual(
    job.noahRevenue.receipts.map((e) => [e.stage, e.amountYen]),
    [
      ['approved', 10000],
      ['paid', 10000],
      ['cost', 0],
    ],
  );
  assert.equal(job.noahRevenue.authorRelation, 'other');
  assert.doesNotMatch(
    JSON.stringify(job),
    /operator-a|bank-line-A|approval-A|final-all-costs/,
  );
  assert.equal(
    noahRevenueReadContext(job, 'owner-a', h.config).receivingConfigured,
    true,
  );
  assert.equal(
    noahRevenueReadContext(job, 'owner-a', noahRevenueConfig({}))
      .receivingConfigured,
    false,
  );
  const unknown = structuredClone(job);
  unknown.noahRevenue.authorRelation = 'unknown';
  assert.equal(
    noahRevenueReadContext(unknown, 'author-account', h.config).operation
      .authorRelation,
    'self',
  );
});
void test('historical Work without a pinned combination version and author cannot receive or expose entries, including applicant work', async (t) => {
  const h = setup(t),
    target = h.config.target;
  function old(familyKey = target.familyKey, url = target.endpoint) {
    const id = crypto.randomUUID();
    const job = createNoahRemoteWork(
      id,
      {
        connectionId: id,
        familyKey,
        digest: 'a'.repeat(64),
        agentName: 'operator',
        host: new URL(url).hostname,
        tool: 'operate',
        toolSha256: '0'.repeat(64),
        toolsSha256: 'b'.repeat(64),
        args: {},
        inputSha256: '9'.repeat(64),
      },
      NOW,
    );
    job.noahRemote.provider = {
      protocol: 'gradio',
      projectId: familyKey,
      origin: url,
      api: 'operate',
      prefix: '',
      repository: 'org/operator',
      data: [],
      phase: 'done',
      eventId: 'provider-issued-event',
      leaseUntil: 0,
      nextPollAt: 0,
      deadline: NOW,
    };
    job.noahRemote.state = 'returned';
    h.sql
      .prepare(
        'INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)',
      )
      .run(id, 'owner-a', JSON.stringify(job), job.revision, job.updatedAt);
    return job;
  }
  const actual = old();
  assert.equal((await h.post(h.envelope(actual.id))).status, 404);
  assert.equal(
    (await h.post(h.envelope(actual.id, { dispatchProof: 'd'.repeat(64) })))
      .status,
    404,
  );
  assert.equal((await h.read('owner-a', actual.id)).noahRevenue, undefined);
  const unrelated = old('applicant', 'https://applicant.example/consult/mcp');
  assert.equal((await h.post(h.envelope(unrelated.id))).status, 404);
  assert.equal((await h.read('owner-a', unrelated.id)).noahRevenue, undefined);
  const duplicate = noahRevenueConfig({
    ...env,
    NOAH_REVENUE_OPERATOR_ACCOUNTS: JSON.stringify({
      'owner-a': 'operator',
      'owner-b': 'operator',
    }),
  });
  assert.equal(duplicate.operatorAccounts['owner-a'], undefined);
  assert.equal(duplicate.operatorAccounts['owner-b'], undefined);
  const applicantCfg = noahRevenueConfig({
    ...env,
    NOAH_REVENUE_PROVIDER_TARGET: JSON.stringify({
      ...target,
      familyKey: 'applicant',
      endpoint: 'https://applicant.example/consult/mcp',
    }),
  });
  assert.equal(applicantCfg.target, undefined);
  bindRevenueExecution(
    unrelated,
    'owner-a',
    applicantCfg,
    'https://applicant.example/consult/mcp',
    'operate',
  );
  assert.equal(
    await revenueDispatchMeta(
      unrelated,
      applicantCfg,
      'https://applicant.example/consult/mcp',
      'operate',
    ),
    undefined,
  );
});
