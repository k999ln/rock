import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { createNoahModelManager } from '../scripts/noah-model-manager.mjs';
import { modelMiddleware } from '../scripts/noah-model-middleware.mjs';
import { NOAH_MODELS } from '../lib/noah-model-catalog.mjs';
import { localModel } from '../scripts/noah-isolated-runtime.mjs';
import { deriveModelTemplate } from '../scripts/noah-model-template.mjs';

const scope = 'owner-v1:' + 'a'.repeat(64),
  m = NOAH_MODELS[0];
const derived = NOAH_MODELS.find(m => m.derivedFrom);
const sourceTemplate = await readFile(new URL('./fixtures/noah-qwen25-template.txt', import.meta.url), 'utf8');
const row = (m, name = m.id) => ({ name, digest: m.digest, size: m.bytes });
async function fixture(t, initial = NOAH_MODELS.filter(m => !m.derivedFrom).map((m) => row(m))) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noah-model-'));
  const rows = new Map(initial.map((r) => [r.name, r])),
    calls = [],
    loaded = [];
  let hook;
  const fetcher = async (url, options) => {
    const endpoint = new URL(url).pathname,
      body = options.body && JSON.parse(options.body);
    calls.push({ endpoint, body });
    const intercepted = await hook?.(endpoint, body, options);
    if (intercepted) return intercepted;
    if (endpoint === '/api/tags')
      return Response.json({ models: [...rows.values()] });
    if (endpoint === '/api/ps') return Response.json({ models: loaded });
    if (endpoint === '/api/show') return Response.json({ template: sourceTemplate });
    if (endpoint === '/api/create') {
      assert.equal(body.from, derived.derivedFrom.id);
      assert.equal(body.stream, false);
      assert.equal(body.template, sourceTemplate.replace('{{ .Function }}', '{{ json .Function }}'));
      rows.set(body.model, row(derived, body.model));
      return Response.json({ status: 'success' });
    }
    if (endpoint === '/api/copy') {
      assert.ok(rows.has(body.source));
      rows.set(body.destination, {
        ...rows.get(body.source),
        name: body.destination,
      });
    } else if (endpoint === '/api/delete') rows.delete(body.model);
    else if (endpoint === '/api/pull') {
      const model = NOAH_MODELS.find((m) => m.id === body.model);
      rows.set(model.id, row(model));
      return new Response('{"status":"success"}\n');
    } else assert.fail(endpoint);
    return new Response(null, { status: 200 });
  };
  const manager = await createNoahModelManager({ root, fetcher });
  t.after(async () => {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    manager,
    fetcher,
    rows,
    calls,
    loaded,
    hook: (f) => {
      hook = f;
    },
  };
}

void test('only the pinned source and result templates can be used for the Tool model', () => {
  assert.match(deriveModelTemplate(derived, sourceTemplate), /\{\{ json \.Function \}\}/);
  for (const input of [undefined, sourceTemplate + '\n', sourceTemplate.replace('Tools', 'changed')])
    assert.throws(() => deriveModelTemplate(derived, input), { status: 409 });
  assert.throws(() => deriveModelTemplate({ ...derived, derivedFrom: { ...derived.derivedFrom, resultTemplateSha256: 'a'.repeat(64) } }, sourceTemplate), { status: 409 });
});

void test('derived preparation shares the base download, pins its own digest, and never deletes original models', async (t) => {
  const f = await fixture(t, []);
  const [base, a, b] = await Promise.all([f.manager.acquire(m.id), f.manager.acquire(derived.id), f.manager.acquire(derived.id)]);
  assert.equal(f.calls.filter(c => c.endpoint === '/api/pull').length, 1);
  assert.equal(f.calls.filter(c => c.endpoint === '/api/create').length, 1);
  assert.equal(a.model, b.model);
  assert.notEqual(a.model, base.model);
  assert.equal(a.digest, derived.digest);
  await assert.rejects(f.manager.remove(derived.id, derived.digest, async () => []), { status: 409 });
  a.release(); b.release();
  await assert.rejects(f.manager.remove(derived.id, derived.digest, async () => [{ id: 'old-work' }]), { status: 409 });
  await f.manager.remove(derived.id, derived.digest, async () => []);
  await base.validate(); base.release();
  assert.deepEqual(f.rows.get(m.id), row(m));
});

void test('unknown templates and a changed base refuse creation; mismatching derived content never becomes ready', async (t) => {
  const f = await fixture(t);
  f.hook(endpoint => endpoint === '/api/show' ? Response.json({ template: sourceTemplate + '\n' }) : undefined);
  await assert.rejects(f.manager.acquire(derived.id), { status: 409 });
  assert.equal(f.calls.filter(c => c.endpoint === '/api/create').length, 0);
  f.hook(null);
  f.rows.set(m.id, { ...row(m), digest: 'c'.repeat(64) });
  await assert.rejects(f.manager.acquire(derived.id), { status: 409 });
  assert.equal(f.calls.filter(c => c.endpoint === '/api/create').length, 0);
  f.rows.set(m.id, row(m));
  f.hook((endpoint, body) => {
    if (endpoint === '/api/create') {
      f.rows.set(body.model, { ...row(derived, body.model), digest: 'd'.repeat(64) });
      return Response.json({ status: 'success' });
    }
  });
  await assert.rejects(f.manager.acquire(derived.id), { status: 409 });
  const listed = (await f.manager.list()).find(r => r.id === derived.id);
  assert.equal(listed.prepared, false);
  assert.equal(listed.state, 'failed');
  assert.equal(listed.connections, 0);
  assert.deepEqual(f.rows.get(m.id), row(m));
});

void test('lost create response recovers the same pinned derivative without creating again', async (t) => {
  const f = await fixture(t);
  f.hook((endpoint, body) => {
    if (endpoint === '/api/create') {
      f.rows.set(body.model, row(derived, body.model));
      throw new Error('response lost');
    }
  });
  await assert.rejects(f.manager.prepare(derived.id), /response lost/);
  f.hook(null);
  const lease = await f.manager.acquire(derived.id);
  await lease.validate(); lease.release();
  assert.equal(f.calls.filter(c => c.endpoint === '/api/create').length, 1);
});

void test('two connections share one preparation and block removal until both release; originals survive', async (t) => {
  const f = await fixture(t);
  const [a, b] = await Promise.all([
    f.manager.acquire(m.id),
    f.manager.acquire(m.id),
  ]);
  assert.equal(a.model, b.model);
  assert.equal(a.digest, m.digest);
  assert.equal(f.calls.filter((c) => c.endpoint === '/api/copy').length, 1);
  await assert.rejects(
    f.manager.remove(m.id, m.digest, async () => []),
    { status: 409 },
  );
  a.release();
  a.release();
  await assert.rejects(
    f.manager.remove(m.id, m.digest, async () => []),
    { status: 409 },
  );
  b.release();
  await f.manager.remove(m.id, m.digest, async () => []);
  assert.ok(f.rows.has(m.id));
  assert.ok(!f.rows.has(a.model));
  await f.manager.remove(m.id, m.digest, async () => []);
  assert.equal(f.calls.filter((c) => c.endpoint === '/api/delete').length, 1);
});
void test('missing source downloads a fixed supported model and concurrent state writes keep both records', async (t) => {
  const f = await fixture(t, []);
  await Promise.all(NOAH_MODELS.map((m) => f.manager.prepare(m.id)));
  assert.equal((await f.manager.list()).filter((r) => r.prepared).length, NOAH_MODELS.length);
  const saved = JSON.parse(
    await readFile(
      path.join(f.root, 'work/runtime-state/noah-models/state.json'),
      'utf8',
    ),
  );
  assert.deepEqual(
    Object.keys(saved.models).sort((a, b) => a.localeCompare(b)),
    NOAH_MODELS.map((m) => m.id).sort((a, b) => a.localeCompare(b)),
  );
  assert.deepEqual(
    f.calls
      .filter((c) => c.endpoint === '/api/pull')
      .map((c) => c.body.model)
      .sort((a, b) => a.localeCompare(b)),
    NOAH_MODELS.filter(m => !m.derivedFrom).map((m) => m.id).sort((a, b) => a.localeCompare(b)),
  );
});
void test('changed source or owned alias cannot be overwritten, executed or removed as a verified version', async (t) => {
  const f = await fixture(t, [{ ...row(m), digest: 'b'.repeat(64) }]);
  await assert.rejects(f.manager.acquire(m.id), { status: 409 });
  assert.equal(f.calls.filter((c) => c.endpoint === '/api/copy').length, 0);
  f.rows.set(m.id, row(m));
  const lease = await f.manager.acquire(m.id);
  lease.release();
  f.rows.set(lease.model, { ...row(m, lease.model), digest: 'b'.repeat(64) });
  await assert.rejects(lease.validate(), { status: 409 });
  await assert.rejects(f.manager.prepare(m.id), { status: 409 });
  await assert.rejects(
    f.manager.remove(m.id, m.digest, async () => []),
    { status: 409 },
  );
  assert.equal(f.calls.filter((c) => c.endpoint === '/api/delete').length, 0);
});
void test('account references, unavailable authorization and loaded models all fail closed before deletion', async (t) => {
  const f = await fixture(t);
  await f.manager.prepare(m.id);
  await assert.rejects(
    f.manager.remove(m.id, m.digest, async () => [{ id: 'other-agent' }]),
    { status: 409 },
  );
  await assert.rejects(
    f.manager.remove(m.id, m.digest, async () => {
      throw new Error('offline');
    }),
    /offline/,
  );
  f.loaded.push(row(m, (await f.manager.list())[0].alias));
  await assert.rejects(
    f.manager.remove(m.id, m.digest, async () => []),
    { status: 409 },
  );
  assert.equal(f.calls.filter((c) => c.endpoint === '/api/delete').length, 0);
});
void test('delete reservation prevents new preparation while account references are checked', async (t) => {
  const f = await fixture(t);
  await f.manager.prepare(m.id);
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const deletion = f.manager.remove(m.id, m.digest, async () => {
    await gate;
    return [];
  });
  await assert.rejects(f.manager.acquire(m.id), { status: 409 });
  await assert.rejects(f.manager.prepare(m.id), { status: 409 });
  release();
  await deletion;
  const lease = await f.manager.acquire(m.id);
  await lease.validate();
  lease.release();
});
void test('failed download or uncertain delete stays retryable without touching original tags', async (t) => {
  const f = await fixture(t, []);
  f.hook((endpoint) =>
    endpoint === '/api/pull'
      ? new Response('{"error":"no space left on device"}\n')
      : undefined,
  );
  await assert.rejects(f.manager.prepare(m.id), { status: 503 });
  assert.equal((await f.manager.list())[0].prepared, false);
  assert.equal((await f.manager.list())[0].state, 'failed');
  f.hook(null);
  await f.manager.prepare(m.id);
  f.hook((endpoint, body) => {
    if (endpoint === '/api/delete') {
      f.rows.delete(body.model);
      throw new Error('response lost');
    }
  });
  await assert.rejects(
    f.manager.remove(m.id, m.digest, async () => []),
    /response lost/,
  );
  assert.equal((await f.manager.list())[0].state, 'interrupted');
  f.hook(null);
  await f.manager.remove(m.id, m.digest, async () => []);
  assert.ok(f.rows.has(m.id));
});
void test('exclusive manager lock and interrupted state survive a clean restart', async (t) => {
  const f = await fixture(t);
  await f.manager.prepare(m.id);
  await assert.rejects(
    createNoahModelManager({ root: f.root, fetcher: f.fetcher }),
    { status: 409 },
  );
  await f.manager.close();
  const file = path.join(f.root, 'work/runtime-state/noah-models/state.json'),
    saved = JSON.parse(await readFile(file, 'utf8'));
  saved.models[m.id].state = 'preparing';
  await writeFile(file, JSON.stringify(saved));
  const next = await createNoahModelManager({
    root: f.root,
    fetcher: f.fetcher,
  });
  try {
    assert.equal((await next.list())[0].state, 'interrupted');
    await next.prepare(m.id);
    assert.equal((await next.list())[0].state, 'ready');
  } finally {
    await next.close();
  }
});
void test('cancelling one connection does not cancel another client sharing preparation', async (t) => {
  const f = await fixture(t);
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  f.hook(async (endpoint) => {
    if (endpoint === '/api/copy') await gate;
  });
  const c = new AbortController(),
    first = f.manager.acquire(m.id, c.signal),
    second = f.manager.acquire(m.id);
  c.abort();
  await assert.rejects(first);
  release();
  const lease = await second;
  assert.equal((await f.manager.list())[0].connections, 1);
  lease.release();
});
void test('model call validates and uses only host-pinned alias; uploaded routing and options are ignored', async () => {
  let validated = 0,
    sent;
  const handle = {
    model: 'noah-fixture/qwen:fixed',
    validate: async () => {
      validated++;
    },
  };
  await localModel(
    {
      model: 'evil',
      options: { num_ctx: 9999999 },
      messages: [{ role: 'user', content: 'hello' }],
    },
    new AbortController().signal,
    async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      sent = JSON.parse(options.body);
      return Response.json({ done: true, message: { content: 'ok' } });
    },
    m.id,
    2048,
    handle,
  );
  assert.equal(validated, 1);
  assert.equal(sent.model, handle.model);
  assert.equal(sent.keep_alive, '30s');
  assert.equal(sent.options.num_ctx, 8192);
});
void test('model middleware denies foreign origin, remote host, stale owner and unapproved mutations', async (t) => {
  const f = await fixture(t);
  const handler = modelMiddleware({
    root: f.root,
    port: 3999,
    getOwner: async () => ({ ownerScope: scope, localHostOwner: true }),
    referencesFor: () => async () => [],
    getManager: async () => f.manager,
  });
  async function invoke(
    headers = {},
    value = { action: 'remove', model: m.id, digest: m.digest, accepted: true },
  ) {
    const request = Readable.from([Buffer.from(JSON.stringify(value))]);
    request.url = '/__noah/models';
    request.method = 'POST';
    request.socket = { remoteAddress: '127.0.0.1' };
    request.headers = {
      host: '127.0.0.1:3999',
      origin: 'http://127.0.0.1:3999',
      'content-type': 'application/json',
      'x-rock-owner-scope': scope,
      ...headers,
    };
    let status, data;
    await handler(
      request,
      {
        writeHead: (n) => {
          status = n;
        },
        end: (v) => {
          data = JSON.parse(v);
        },
      },
      () => assert.fail('route missed'),
    );
    return { status, data };
  }
  assert.equal(
    (await invoke({ origin: 'https://elsewhere.example' })).status,
    403,
  );
  assert.equal((await invoke({ host: 'evil.example:3999' })).status, 403);
  assert.equal(
    (await invoke({ 'x-rock-owner-scope': 'owner-v1:' + 'b'.repeat(64) }))
      .status,
    409,
  );
  assert.equal(
    (
      await invoke(
        {},
        { action: 'remove', model: m.id, digest: m.digest, accepted: false },
      )
    ).status,
    400,
  );
  assert.equal((await invoke()).status, 200);
});
