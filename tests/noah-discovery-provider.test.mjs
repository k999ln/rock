import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectDiscoverySource,
  normalizeDiscovery,
  discoveryIdentity,
} from '../lib/noah-discovery-provider.ts';
const github = {
  id: 1,
  full_name: 'maker/agent',
  name: 'Agent',
  private: false,
  fork: false,
  archived: false,
  default_branch: 'feature/main',
  topics: ['agent', 'tools'],
  description: 'Public description',
  license: { spdx_id: 'MIT' },
};
const hf = {
  _id: 'a'.repeat(24),
  id: 'maker/agent',
  private: false,
  sha: 'b'.repeat(40),
  sdk: 'gradio',
  cardData: { title: 'Test Agent', license: 'apache-2.0' },
  tags: ['agent'],
};
async function collect(fetcher, extra = {}) {
  const rows = [],
    withdrawn = [];
  const result = await collectDiscoverySource({
    provider: 'github',
    etag: null,
    known: [],
    fetcher,
    now: () => 1000000,
    onCandidate: async (v) => rows.push(v),
    onWithdrawn: async (v) => withdrawn.push(v),
    ...extra,
  });
  return { rows, withdrawn, result };
}
void test('GitHub and HF normalize only public resources and keep source commits and license uncertainty', () => {
  assert.equal(
    normalizeDiscovery('github', github, 'b'.repeat(40)).commit,
    'b'.repeat(40),
  );
  assert.equal(
    normalizeDiscovery('huggingface', hf).url,
    'https://huggingface.co/spaces/maker/agent',
  );
  for (const field of ['private', 'archived', 'disabled', 'fork'])
    assert.equal(
      normalizeDiscovery('github', { ...github, [field]: true }),
      null,
    );
  for (const v of [
    { ...hf, gated: 'auto' },
    { ...hf, private: undefined },
    { ...hf, id: '../../secret' },
    { ...hf, _id: 'bad' },
  ])
    assert.equal(normalizeDiscovery('huggingface', v), null);
  assert.equal(
    normalizeDiscovery('github', {
      ...github,
      license: { spdx_id: 'NOASSERTION' },
    }).license,
    null,
  );
});
void test('individual public state and fixed branch are checked; no authentication, arbitrary URL or executable content is requested', async () => {
  const calls = [];
  const v = await collect(async (url, init) => {
    calls.push({ url, init });
    return Response.json(
      url.includes('/search/')
        ? { items: [github], incomplete_results: false }
        : url.includes('/git/ref/')
          ? { object: { sha: 'b'.repeat(40) } }
          : github,
      { headers: { etag: '"v1"' } },
    );
  });
  assert.equal(v.rows.length, 1);
  assert.equal(v.result.calls, 3);
  assert.equal(v.rows[0].commit, 'b'.repeat(40));
  assert.ok(calls[2].url.endsWith('/git/ref/heads/feature/main'));
  assert.ok(
    calls.every(
      (c) =>
        c.init.redirect === 'manual' &&
        !c.init.headers.Authorization &&
        !c.init.body,
    ),
  );
});
void test('304 preserves ETag and rechecks known candidates; search absence alone never withdraws', async () => {
  let calls = 0;
  const v = await collect(
    async () =>
      ++calls === 1
        ? new Response(null, { status: 304 })
        : Response.json(
            calls === 2 ? github : { object: { sha: 'b'.repeat(40) } },
          ),
    {
      etag: '"old"',
      known: [{ id: 'old', external_id: '1', repository: 'maker/agent' }],
    },
  );
  assert.equal(v.result.etag, '"old"');
  assert.equal(v.rows.length, 1);
  assert.equal(v.withdrawn.length, 0);
});
void test('individual 404, changed identity, private, gated and archived withdraw the original candidate', async () => {
  for (const detail of [
    new Response(null, { status: 404 }),
    Response.json({ ...github, id: 99 }),
    Response.json({ ...github, private: true }),
    Response.json({ ...github, archived: true }),
  ]) {
    const r = await collect(async (url) =>
      url.includes('/search/') ? Response.json({ items: [github] }) : detail,
    );
    assert.deepEqual(r.withdrawn, [await discoveryIdentity('github', '1')]);
    assert.equal(r.rows.length, 0);
  }
  const r = await collect(
    async (url) =>
      url.includes('?')
        ? Response.json([hf])
        : Response.json({ ...hf, gated: 'auto' }),
    { provider: 'huggingface' },
  );
  assert.equal(r.withdrawn.length, 1);
});
void test('rate limits, redirects, malformed, oversized and incomplete results are bounded without retry', async () => {
  for (const [response, code] of [
    [
      new Response(null, { status: 429, headers: { 'retry-after': '3600' } }),
      'rate_limited',
    ],
    [
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.test' },
      }),
      'unavailable',
    ],
    [
      Response.json({ items: [], incomplete_results: true }),
      'invalid_response',
    ],
    [new Response('{'), 'invalid_response'],
    [new Response('x'.repeat(1048577)), 'invalid_response'],
  ]) {
    let calls = 0;
    await assert.rejects(
      collect(async () => {
        calls++;
        return response;
      }),
      (e) =>
        e.code === code && (code !== 'rate_limited' || e.retryAt === 4600000),
    );
    assert.equal(calls, 1);
  }
});
void test('HF spaces keep an immutable repository identity and commit without downloading files or launching its UI', async () => {
  const calls = [];
  const r = await collect(
    async (url) => {
      calls.push(url);
      return Response.json(url.includes('?') ? [hf] : hf);
    },
    { provider: 'huggingface' },
  );
  assert.equal(r.rows[0].commit, hf.sha);
  assert.equal(r.rows[0].externalId, hf._id);
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every((u) => u.startsWith('https://huggingface.co/api/spaces')),
  );
});
