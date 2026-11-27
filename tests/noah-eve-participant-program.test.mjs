import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { runEveAgents as device } from '../public/noah-shared-compute/eve-agents.mjs';
import { runEveAgents, normalizeEveRecipe, EVE_AGENT_SHA256 } from '../lib/noah-eve-participant.ts';
import { formatCitations, makeFreeArticle } from '../lib/mr-tools.ts';
import { transformCsv, decodeCsv } from '../lib/csv-transform.ts';

const citations = 'market:tool:mr-citations', article = 'market:tool:mr-free-article', csv = 'market:tool:rockstar-csv-cleanup';
const fixture = name => readFileSync(new URL('../toolkits/mr/examples/' + name, import.meta.url), 'utf8');
const options = { afterChars: 40, price: 500, summary: fixture('summary.md'), paidContents: '完全版の説明', noteUrl: 'https://note.com/example/n/public' };

void test('the participant executes the actual catalog tools in the selected order, and the sealed program is reproducible', () => {
  const source = fixture('article.md');
  const recipe = {agents: [citations,article], source, options};
  const expected = makeFreeArticle({...options, markdown: formatCitations(source)});
  const result = { text: expected, steps: recipe.agents };
  assert.deepEqual(runEveAgents(recipe), result);
  assert.deepEqual(device(recipe), result);
  const bytes = readFileSync(new URL('../public/noah-shared-compute/eve-agents.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), EVE_AGENT_SHA256);
  execFileSync(process.execPath, ['scripts/build-noah-eve-participant.mjs','--check'], {cwd:new URL('../',import.meta.url),stdio:'pipe'});
});

void test('public CSV uses the existing cleanup semantics with quoted rows, full-width spaces, duplicates and spreadsheet-safe cells', async () => {
  const source = 'name,data\r\n A , 001 \r\n　A　,001\r\nB,"a,b"\r\nC,"a\nb"\r\nD,=1+1\r\n';
  const spec = {trim:['name','data'],dedupe:{keys:['name','data'],mode:'first'},spreadsheetSafe:true,outputEncoding:'utf8'};
  const existing = await transformCsv(new TextEncoder().encode(source),spec);
  const result = {text:decodeCsv(existing.safeOutput).text,steps:[csv]};
  assert.deepEqual(device({source,agents:[csv]}),result);
  assert.deepEqual(runEveAgents({source,agents:[csv]}),result);
});
void test('unregistered IDs, incompatible selected steps, raw instructions as configuration and over-budget inputs are refused', () => {
  for (const recipe of [
    {agents:['market:tool:unknown'],source:'x'}, {agents:[],source:'x'},
    {agents:[csv,citations],source:'x'}, {agents:[article],source:'x'},
    {agents:[citations],source:'字'.repeat(1400)}, {agents:[citations],source:'x',chat:'private'},
    {agents:[citations],source:'x',options}, {agents:[article],source:'x',options:{...options,command:'run'}},
    {agents:[article],source:'x',options:{...options,noteUrl:'https://note.com.attacker.test/a/n/b'}},
  ]) { assert.throws(() => normalizeEveRecipe(recipe)); assert.throws(() => device(recipe)); }
});
