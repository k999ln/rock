import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createContext, Script } from 'node:vm';

void test('standalone inspector bundles the real detector in a data-only worker', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'spider-artifact-'));
  try {
    const output = resolve(directory, 'SPIDER.html');
    execFileSync(process.execPath, ['scripts/build-spider-inspector.mjs', '--output', output]);
    const html = await readFile(output, 'utf8');
    assert.ok(html.includes("connect-src 'none'"));
    assert.ok(!/<script[^>]+src=/i.test(html));
    assert.ok(!html.includes('__SPIDER_WORKER_JSON__'));
    const workerCode = JSON.parse(html.match(/<script id="inspector-worker" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    const replies = [];
    const context = createContext({ TextEncoder, self: { postMessage: value => replies.push(value) } });
    new Script(workerCode).runInContext(context);
    context.self.onmessage({ data: { id: 1, language: 'javascript', source: 'throw new Error("must never run");\nconst apiKey = "fixture-only-secret";\neval(input);' } });
    assert.equal(replies[0].id, 1);
    assert.equal(replies[0].result.counts.secret, 1);
    assert.equal(replies[0].result.counts.code, 1);
    assert.ok(!JSON.stringify(replies[0]).includes('fixture-only-secret'));
    context.self.onmessage({ data: { id: 2, language: 'javascript', source: 'document.body.replaceChildren();\nconst text = "</script><script>throw new Error()";\nwhile (true) {}' } });
    assert.equal(replies[1].id, 2);
    assert.equal(replies[1].result.state, 'no_findings');
    context.self.onmessage({ data: { id: 3, language: 'text', source: 'x'.repeat(65537) } });
    assert.equal(replies[2].error, 'CODE_INSPECTION_TOO_LARGE');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
