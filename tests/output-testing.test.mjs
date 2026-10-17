import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalog } from '../lib/catalog.ts';
import { testScenarios, sampleValues } from '../lib/test-workspace.ts';
import { executeOutputTest } from '../lib/test-workspace-executor.ts';
import { POST } from '../app/api/output-tests/route.ts';

await test('all catalog entries have honest output-test coverage and samples execute without providers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('External I/O is forbidden in output tests');
  };
  try {
    assert.equal(
      new Set(testScenarios.map((s) => s.id)).size,
      testScenarios.length,
    );
    for (const item of catalog)
      assert.ok(
        testScenarios.some((s) => s.id === item.id),
        item.id,
      );
    for (const scenario of testScenarios) {
      const result = await executeOutputTest({
        id: scenario.id,
        values: sampleValues(scenario),
      });
      assert.ok(result.output.length > 0, scenario.id);
      assert.equal(
        result.status,
        scenario.mode === 'unconnected' ? 'not_run' : 'output',
        scenario.id,
      );
      assert.equal(result.mode, scenario.mode);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
await test('real CSV output changes with input, reports checks, and remains spreadsheet safe', async () => {
  const result = await executeOutputTest({
    id: 'rockstar-csv-cleanup',
    values: { key: 'id', text: 'id,name\n2, beta \n1,=1+1\n2,beta' },
  });
  assert.match(result.output, /1,'=1\+1/);
  assert.equal(result.details.output.rows, 2);
  assert.equal(result.details.validation.passed, true);
  assert.match(result.output, /2,beta/);
});
await test('sample work events never count as real completion', async () => {
  const result = await executeOutputTest({
    id: 'test-zema',
    values: { text: '試験の仕事' },
  });
  assert.equal(result.details.status, 'active');
  assert.equal(result.details.revision, 1);
  assert.equal(
    result.details.steps.some((s) => s.passed),
    false,
  );
  assert.equal(result.details.events[0].command.sample, true);
});
await test('test dispatcher rejects escalation, missing data and oversized inputs', async () => {
  for (const input of [
    { id: 'arbitrary-shell', values: {} },
    { id: 'mr-citations', values: { text: 'hello', token: 'not-a-token' } },
    { id: 'mr-citations', values: { text: 'hello' }, owner: 'other-user' },
    { id: 'mr-citations', values: { text: 'x'.repeat(12001) } },
    { id: 'mr-citations', values: {} },
    { id: 'test-wallet', values: { amount: '100', spent: '101' } },
  ])
    await assert.rejects(executeOutputTest(input));
});
await test('test HTTP boundary is anonymous but same-origin only, bounded, and never cacheable', async () => {
  const payload = JSON.stringify({
    id: 'mr-citations',
    values: { text: '入力を変えた実テスト。' },
  });
  const request = (
    body,
    origin = 'https://rock.example',
    contentType = 'application/json',
  ) =>
    new Request('https://rock.example/api/output-tests', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': contentType },
      body,
    });
  const ok = await POST(request(payload));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.match((await ok.json()).result.output, /入力を変えた実テスト/);
  assert.equal(
    (await POST(request(payload, 'https://other.example'))).status,
    403,
  );
  assert.equal((await POST(request(payload, ''))).status, 403);
  assert.equal(
    (await POST(request(payload, 'https://rock.example', 'text/plain'))).status,
    415,
  );
  assert.equal((await POST(request('x'.repeat(64001)))).status, 413);
  assert.equal((await POST(request('{invalid'))).status, 400);
});
await test('test execution has no persistent or privileged adapter imports', async () => {
  const source = await readFile(
    new URL('../lib/test-workspace-executor.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /fetch\s*\(|localStorage|cloudflare:workers|child_process|requestUser|from ['"][^'"]*(?:store|billing|device|mcp-client)/,
  );
});
