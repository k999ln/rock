import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { formatCitations, makeFreeArticle } from '../lib/mr-tools.ts';

const fixture = JSON.parse(readFileSync(new URL('../contracts/article-fixtures.json', import.meta.url), 'utf8'));
const classes = resolve(process.argv[2] || 'android/core/build/classes/java/main');
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin/java') : 'java';
const b64 = value => Buffer.from(value, 'utf8').toString('base64');
function run(operation, input) {
  const args = operation === 'citations'
    ? [operation, b64(input.markdown)]
    : [operation, b64(input.markdown), String(input.afterChars), b64(input.summary), String(input.price), b64(input.paidContents), b64(input.noteUrl)];
  const r = spawnSync(java, ['-cp', classes, 'dev.rock.core.ArticleTools', ...args], { encoding: 'utf8', timeout: 10_000 });
  if (r.error || r.signal || ![0, 2].includes(r.status)) throw new Error(`Java harness unavailable: ${r.error?.message || r.stderr}`);
  return { code: r.status, output: Buffer.from(r.stdout, 'base64').toString('utf8') };
}
let checks = 0;
for (const item of fixture.cases) {
  const input = { ...fixture, ...item };
  const citations = formatCitations(input.markdown);
  const formatted = run('citations', input);
  assert.equal(formatted.code, 0, item.name);
  assert.equal(formatted.output, citations, `${item.name}: citations parity`);
  checks++;
  for (const markdown of [input.markdown, citations]) {
    const value = { ...input, markdown };
    const free = run('free-article', value);
    if (item.reject) {
      assert.throws(() => makeFreeArticle(value), undefined, item.name);
      assert.equal(free.code, 2, `${item.name}: reject`);
    } else {
      assert.equal(free.code, 0, item.name);
      assert.equal(free.output, makeFreeArticle(value), `${item.name}: free edition parity`);
    }
    checks++;
  }
}
console.log(`OS tool parity: ${checks} checks passed (Java ↔ existing TypeScript; synthetic inputs only)`);
