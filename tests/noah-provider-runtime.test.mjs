import test from 'node:test';
import { noahBrowserRequestAllowed } from '../lib/noah-browser-session.ts';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/noah/intake.mjs';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { createNoahProviderRuntime } from '../lib/noah-provider-runtime.ts';
import { createNoahProviderApi } from '../lib/noah-provider-api.ts';
import { createNoahAskApi } from '../lib/noah-ask.ts';
import {
  providerEndpoints,
  providerInput,
  readProviderEvents,
  providerResult,
  prepareProvider,
} from '../lib/noah-gradio.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const projectId = 'project-' + 'a'.repeat(64),
  origin = 'https://example-demo.hf.space';
const info = () => ({
  named_endpoints: {
    '/predict': {
      parameters: [
        {
          parameter_name: 'message',
          label: 'Message',
          parameter_has_default: false,
          type: { type: 'string' },
          component: 'Textbox',
        },
      ],
      returns: [{ type: { type: 'string' } }],
    },
  },
});
const event = (name, value) =>
  new Response(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
void test('provider complete containing an authentication exception is not a successful Agent result', async () => {
  await assert.rejects(providerResult(['Error during processing: litellm.AuthenticationError: API key not valid'], origin));
  await assert.rejects(providerResult([{error:'authentication failed'}], origin));
});
void test('known shared private-data demos cannot be probed or executed as public Agent connections', async t => {
  const f=fixture(t,async()=>{throw Error('must not contact held provider');});
  for (const repository of ['Americo/Agente_Analista', 'sdajani/co-scientist-public-demo']) {
    const runtime=createNoahProviderRuntime({...f.deps,providerDirectory:async()=>[{card:{id:projectId,name:'Shared demo',href:`https://huggingface.co/spaces/${repository}`,sources:[]},families:[]}]});
    await assert.rejects(runtime.plan(projectId),e=>e.status===422&&e.message.includes('本人専用'));
  }
});
function setup(t, overrides = {}) {
  const state = {
    info: info(),
    posts: [],
    reads: 0,
    mode: 'complete',
    ...overrides,
  };
  const fetcher = async (url, init = {}) => {
    assert.equal(init.redirect, 'manual');
    if (url === 'https://huggingface.co/api/spaces/example/demo')
      return Response.json({
        id: 'example/demo',
        private: false,
        sdk: 'gradio',
        host: origin,
        runtime: { stage: 'RUNNING' },
      });
    if (url === origin + '/config') return Response.json({ version: '6.15.1' });
    if (url === origin + '/gradio_api/info') return Response.json(state.info);
    if (url === origin + '/gradio_api/call/predict') {
      assert.equal(init.method, 'POST');
      state.posts.push(JSON.parse(init.body));
      if (state.onPost) await state.onPost();
      if (state.lost) throw Error('network lost');
      return Response.json({ event_id: 'event_1' });
    }
    if (url === origin + '/gradio_api/call/predict/event_1') {
      state.reads++;
      if (state.onRead) await state.onRead();
      if (state.mode === 'pending') return event('heartbeat', null);
      if (state.mode === 'gpu')
        return event(
          'error',
          'The requested GPU duration (270s) is larger than the maximum allowed',
        );
      return event('complete', ['Hello from the Agent']);
    }
    throw Error('Unexpected URL ' + url);
  };
  const f = fixture(t, fetcher),
    pending = [];
  const deps = {
    ...f.deps,
    flags: parseNoahFlags({
      NOAH_INTAKE_PUBLIC: 'true',
      NOAH_ASK_FORM: 'true',
    }),
    authenticate: async () => 'owner-a',
    reviewers: [],
    waitUntil: (p) => pending.push(p),
    providerDirectory: async () => [
      {
        card: {
          id: projectId,
          feedbackId: projectId,
          name: 'Demo',
          href: 'https://huggingface.co/spaces/example/demo',
          sources: [],
        },
        families: [],
      },
    ],
  };
  const runtime = createNoahProviderRuntime(deps);
  const input = async () => ({
    id: crypto.randomUUID(),
    projectId,
    api: 'predict',
    digest: (await runtime.plan(projectId)).endpoints[0].digest,
    input: { message: 'Hello' },
    confirm: true,
  });
  return {
    f,
    state,
    deps,
    runtime,
    input,
    pending,
    drain: async () => {
      while (pending.length) await Promise.all(pending.splice(0));
    },
  };
}
void test('provider work survives a fresh runtime and uses the common list/detail/result paths without resubmitting', async (t) => {
  const w = setup(t),
    input = await w.input(),
    accepted = await w.runtime.accept('owner-a', false, input);
  assert.equal(accepted.job.noahRemote.state, 'queued');
  await accepted.run();
  let job = await w.runtime.get('owner-a', input.id);
  assert.equal(job.noahRemote.provider.eventId, 'event_1');
  assert.equal(job.noahRemote.state, 'running');
  assert.deepEqual(job.noahRemote.provider.data, []);
  const fresh = createNoahProviderRuntime(w.deps);
  w.state.mode = 'complete';
  w.f.advance(4000);
  await fresh.poll('owner-a', input.id);
  job = await fresh.get('owner-a', input.id);
  assert.equal(job.noahRemote.state, 'returned');
  assert.equal(job.noahRemote.result.text, 'Hello from the Agent');
  assert.equal(job.status, 'review');
  assert.equal(job.steps[0].passed, false);
  assert.equal(w.state.posts.length, 1);
  const api = createNoahAskApi(w.deps);
  const list = await (
    await api.collection(new Request('https://noah.test/api/noah/ask'))
  ).json();
  assert.equal(list.asks[0].id, input.id);
  assert.equal(list.asks[0].mode, 'provider');
  const detail = await (
    await api.item(
      new Request('https://noah.test/api/noah/ask/' + input.id),
      input.id,
    )
  ).json();
  assert.equal(detail.result.text, 'Hello from the Agent');
  assert.equal(await fresh.get('owner-b', input.id), null);
  await w.drain();
});
void test('concurrent accepts and dispatches send once; changed content and another owner cannot reuse the ID', async (t) => {
  const w = setup(t),
    input = await w.input();
  const results = await Promise.all([
    w.runtime.accept('owner-a', false, input),
    w.runtime.accept('owner-a', false, input),
  ]);
  await Promise.all(
    results.map(async (r) => {
      await r.run?.();
    }),
  );
  await w.runtime.run('owner-a', input.id, false);
  assert.equal(w.state.posts.length, 1);
  assert.equal((await w.runtime.accept('owner-a', false, input)).replay, true);
  await assert.rejects(
    w.runtime.accept('owner-a', false, {
      ...input,
      input: { message: 'changed' },
    }),
  );
  await assert.rejects(w.runtime.accept('owner-b', false, input));
  assert.equal(w.state.posts.length, 1);
});
void test('the provider schema and saved permission are checked again before dispatch', async (t) => {
  const w = setup(t),
    accepted = await w.runtime.accept('owner-a', false, await w.input());
  w.state.info.named_endpoints['/predict'].parameters[0].label = 'Different';
  await accepted.run();
  assert.equal(w.state.posts.length, 0);
  assert.equal(
    (await w.runtime.get('owner-a', accepted.job.id)).noahRemote.state,
    'failed',
  );
  const input = await w.input();
  const allowed = await w.runtime.accept('owner-a', false, input);
  w.deps.authorizeAction = async () => {
    throw Error('denied');
  };
  await allowed.run();
  assert.equal(w.state.posts.length, 0);
});
void test('a lost submission response becomes unknown and never retries an external POST', async (t) => {
  const w = setup(t, { lost: true }),
    input = await w.input(),
    accepted = await w.runtime.accept('owner-a', false, input);
  await accepted.run();
  assert.equal(
    (await w.runtime.get('owner-a', input.id)).noahRemote.state,
    'unknown',
  );
  w.f.advance(65000);
  await w.runtime.sweep();
  await w.runtime.run('owner-a', input.id, false);
  await w.runtime.accept('owner-a', false, input);
  assert.equal(w.state.posts.length, 1);
});
void test('stopping while an external POST returns wins over a late result', async (t) => {
  const w = setup(t),
    input = await w.input(),
    a = await w.runtime.accept('owner-a', false, input);
  w.state.onPost = async () => {
    const job = await w.runtime.get('owner-a', input.id);
    await w.runtime.stop('owner-a', input.id, job.revision);
  };
  await a.run();
  w.state.mode = 'complete';
  w.f.advance(40000);
  await w.runtime.sweep();
  const job = await w.runtime.get('owner-a', input.id);
  assert.equal(job.noahRemote.state, 'cancelled');
  assert.equal(job.noahRemote.result, undefined);
  assert.equal(w.state.reads, 0);
});
void test('GPU errors are saved as provider failures, not connection retries or successful results', async (t) => {
  const w = setup(t, { mode: 'gpu' }),
    a = await w.runtime.accept('owner-a', false, await w.input());
  await a.run();
  await w.runtime.poll('owner-a', a.job.id);
  const job = await w.runtime.get('owner-a', a.job.id);
  assert.equal(job.noahRemote.state, 'failed');
  assert.match(job.noahRemote.error, /GPU利用上限/);
  assert.equal(job.noahRemote.result, undefined);
});
void test('stale dispatch and queued work are not silently resubmitted; three concurrent work items are bounded atomically', async (t) => {
  const w = setup(t),
    inputs = await Promise.all(Array.from({ length: 4 }, () => w.input()));
  const accepted = await Promise.allSettled(
    inputs.map((i) => w.runtime.accept('owner-a', false, i)),
  );
  assert.equal(accepted.filter((r) => r.status === 'fulfilled').length, 3);
  w.f.advance(65000);
  await w.runtime.sweep();
  assert.equal(w.state.posts.length, 0);
  assert.equal(
    (await w.runtime.list('owner-a')).every((j) => j.finishedAt !== undefined),
    true,
  );
  await w.drain();
});
void test('API enforces origin, owner intent, confirmation, bounded known fields, and preserves same-ID responses', async (t) => {
  const w = setup(t),
    api = createNoahProviderApi(w.deps),
    input = await w.input(),
    scope = await ownerScopeFor('owner-a');
  const request = (body, headers = {}) =>
    new Request('https://noah.test/api/noah/provider', {
      method: 'POST',
      headers: {
        Origin: 'https://noah.test',
        'Content-Type': 'application/json',
        'X-Rock-Owner-Scope': scope,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await api(request(input, { Origin: 'https://evil.test' }))).status,
    403,
  );
  assert.equal(
    (
      await api(
        request(input, {
          'X-Rock-Owner-Scope': await ownerScopeFor('owner-b'),
        }),
      )
    ).status,
    409,
  );
  assert.equal((await api(request({ ...input, confirm: false }))).status, 400);
  assert.equal(
    (
      await api(
        request({
          ...input,
          input: { message: 'Hi', url: 'http://127.0.0.1' },
        }),
      )
    ).status,
    422,
  );
  const accepted = await api(request(input));
  assert.equal(accepted.status, 202);
  await w.drain();
  assert.equal((await api(request(input))).status, 200);
  assert.equal(w.state.posts.length, 1);
});
void test('public metadata cannot redirect a runtime to another host, private Space, or arbitrary URL', async () => {
  for (const info of [
    {
      id: 'example/demo',
      private: false,
      sdk: 'gradio',
      host: 'http://127.0.0.1',
      runtime: { stage: 'RUNNING' },
    },
    {
      id: 'example/demo',
      private: true,
      sdk: 'gradio',
      host: origin,
      runtime: { stage: 'RUNNING' },
    },
  ]) {
    let calls = 0;
    await assert.rejects(
      prepareProvider('example/demo', async () => {
        calls++;
        return Response.json(info);
      }),
    );
    assert.equal(calls, 1);
  }
});
void test('SSE parser ignores intermediate results, joins split CRLF frames and preserves errors', async () => {
  const text =
      'event: generating\r\ndata: ["not final"]\r\n\r\nevent: complete\r\ndata: ["final"]\r\n\r\n',
    bytes = new TextEncoder().encode(text);
  const response = new Response(
    new ReadableStream({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
  assert.deepEqual(await readProviderEvents(response), {
    state: 'complete',
    data: ['final'],
  });
  assert.equal(
    (await readProviderEvents(event('generating', ['still working']))).state,
    'pending',
  );
});
void test('image copying is restricted to same-origin Gradio files and stores actual validated bytes', async () => {
  const png = Uint8Array.from([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      ...Array(24).fill(0),
    ]),
    requests = [];
  const result = await providerResult(
    [
      {
        meta: { _type: 'gradio.FileData' },
        url: origin + '/gradio_api/file=/tmp/image.png',
      },
      { meta: { _type: 'gradio.FileData' }, url: 'http://127.0.0.1/secret' },
    ],
    origin,
    async (url, init) => {
      requests.push(url);
      assert.equal(init.redirect, 'manual');
      return new Response(png);
    },
  );
  assert.equal(requests.length, 1);
  assert.equal(result.images.length, 1);
  assert.equal(result.attachments, 2);
  assert.match(result.text, /保存できません/);
  await assert.rejects(providerResult([''], origin, fetch));
});
void test('unsupported complex fields cannot become arbitrary JSON or file-path inputs', async () => {
  const value = info();
  value.named_endpoints['/predict'].parameters.push({
    parameter_name: 'danger',
    type: { type: 'object' },
    parameter_has_default: false,
    component: 'JSON',
  });
  assert.deepEqual(await providerEndpoints(value), []);
  const endpoint = (await providerEndpoints(info()))[0];
  assert.throws(() =>
    providerInput(endpoint, { message: 'Hello', extra: 'secret' }),
  );
});

void test('browser ownership permits only the provider collection, not arbitrary provider subpaths', () => {
  for (const method of ['GET', 'POST'])
    assert.equal(
      noahBrowserRequestAllowed(
        new Request('https://noah.test/api/noah/provider', { method }),
      ),
      true,
    );
  for (const path of [
    '/api/noah/provider/admin',
    '/api/noah/provider/../../wallet',
    '/api/noah/runner',
  ])
    assert.equal(
      noahBrowserRequestAllowed(
        new Request('https://noah.test' + path, { method: 'POST' }),
      ),
      false,
    );
});

void test('numeric bounds and credential fields are enforced before sending input', async () => {
  const endpoint = (await providerEndpoints(info()))[0];
  endpoint.fields.push({
    name: 'tokens',
    label: 'Tokens',
    kind: 'number',
    optional: true,
    value: 64,
    minimum: 64,
    maximum: 128,
    integer: true,
  });
  assert.throws(() => providerInput(endpoint, { message: 'Hi', tokens: 32 }));
  assert.throws(() => providerInput(endpoint, { message: 'Hi', tokens: 65.5 }));
  assert.deepEqual(providerInput(endpoint, { message: 'Hi' }), ['Hi', 64]);
  const privateInfo = info();
  privateInfo.named_endpoints['/predict'].parameters[0].parameter_name =
    'api_key';
  assert.deepEqual(await providerEndpoints(privateInfo), []);
});

void test('Gradio disconnect is terminal unknown, never reopens SSE or repeats inference', async (t) => {
  const w = setup(t, { mode: 'pending' }),
    input = await w.input(),
    a = await w.runtime.accept('owner-a', false, input);
  await a.run();
  await w.runtime.poll('owner-a', input.id);
  assert.equal(
    (await w.runtime.get('owner-a', input.id)).noahRemote.state,
    'unknown',
  );
  w.f.advance(700000);
  await w.runtime.sweep();
  await w.runtime.poll('owner-a', input.id);
  assert.equal(w.state.posts.length, 1);
  assert.equal(w.state.reads, 1);
});

void test('one live result stream excludes overlapping readers and preserves a stop while waiting', async (t) => {
  const w = setup(t),
    input = await w.input(),
    accepted = await w.runtime.accept('owner-a', false, input);
  await accepted.run();
  let release, entered;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  w.state.onRead = async () => {
    entered();
    await waiting;
  };
  const first = w.runtime.poll('owner-a', input.id);
  await started;
  await w.runtime.poll('owner-a', input.id);
  await w.runtime.sweep();
  assert.equal(w.state.reads, 1);
  const job = await w.runtime.get('owner-a', input.id);
  await w.runtime.stop('owner-a', input.id, job.revision);
  release();
  await first;
  assert.equal(
    (await w.runtime.get('owner-a', input.id)).noahRemote.state,
    'cancelled',
  );
});
void test('the owned streaming HTTP response remains open until the result has been stored', async (t) => {
  const w = setup(t),
    input = await w.input(),
    a = await w.runtime.accept('owner-a', false, input);
  await a.run();
  const api = createNoahProviderApi(w.deps);
  const response = await api(
    new Request('https://noah.test/api/noah/provider?work=' + input.id),
  );
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson');
  assert.equal(JSON.parse(await response.text()).state, 'succeeded');
  assert.equal(
    (await w.runtime.get('owner-a', input.id)).noahRemote.result.text,
    'Hello from the Agent',
  );
  w.deps.authenticate = async () => 'owner-b';
  assert.equal(
    (
      await createNoahProviderApi(w.deps)(
        new Request('https://noah.test/api/noah/provider?work=' + input.id),
      )
    ).status,
    404,
  );
});
