import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, stopChildren } from './noah.mjs';

/** Synthetic package acceptance only. No account, model or external Provider is used. */
export async function runDemo() {
  const { McpHub, validateRegistry } = await import('./toolkits/sky-mcp-connector/server.mjs');
  const registryPath = join(root, 'toolkits/sky-mcp-connector/registry.article-editing.json');
  const hub = new McpHub(validateRegistry(JSON.parse(await readFile(registryPath, 'utf8')), registryPath));
  const results = [];
  try {
    const passport = await hub.connect('rock-star-mr');
    assert.equal(passport.tools.length, 4);
    const example = name => readFile(join(root, 'toolkits/mr/examples', name), 'utf8');
    const article = await example('article.md');
    const calls = [
      ['coconala_check', JSON.parse(await example('coconala.json'))],
      ['format_citations', { text: article }],
      ['make_free_article', { markdown: article, summary: await example('summary.md'), afterChars: 40, price: 500,
        paidContents: '実践手順と記録方法', noteUrl: 'https://note.com/your_account/n/your_article' }],
      ['verify_delivery', { sample: true }],
    ];
    for (const [tool, input] of calls) {
      const result = await hub.rpc('rock-star-mr', 'tools/call', { name: tool, arguments: input });
      assert.notEqual(result.isError, true, tool);
      const text = result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
      assert.ok(text?.length, tool);
      if (tool === 'verify_delivery') assert.match(text, /PASS/);
      results.push({ tool, passed: true, outputChars: text.length });
    }
  } finally { await stopChildren(hub); }
  const { createRuntime } = await import('./toolkits/fashion-brand-ops/src/runtime.mjs');
  const runtime = createRuntime({ config: { dbPath: ':memory:', approvalSecret: '',
    creativeProvider: 'mock', socialProvider: 'mock', paymentProvider: 'mock', notificationProvider: 'mock' } });
  try {
    const input = { run_id: 'noah-package-demo', worldview: '合成試験用の受注生産ブランド', product_design: '合成サンプルのシャツ', region: '日本' };
    const first = await runtime.callTool('fashion.producer.start', input);
    const replay = await runtime.callTool('fashion.producer.start', input);
    assert.equal(first.external_effects_executed, false);
    assert.equal(first.first_draft.status, 'draft');
    assert.equal(replay.idempotent_replay, true);
    assert.equal(runtime.store.get('SELECT COUNT(*) AS count FROM effect_runs').count, 0);
    results.push({ tool: 'fashion.producer.start', passed: true, externalEffects: 0, duplicateRun: false });
  } finally { runtime.store.close(); }
  return { scope: 'synthetic_local_package', realModelInference: false, externalProvider: false, results };
}
