#!/usr/bin/env node
// Eve の本番の実行役（task 130、2026-11-25）。組み合わせを、本物の部品で 1 回回す。本人の番で止まり、本人が返した中身で続きから動く。
// 公開・登録・申請・送金はしない（どれも本人の番）。LLM を使う部品は、手元の Qwen（scripts/eve-local-llm.py）で動かす。
//
// 使い方（手元の LLM: python3 scripts/eve-local-llm.py <qwen.gguf> & の後）:
//   node --experimental-strip-types scripts/eve-run.mjs start --combination affiliate:ai-agent-cloud:blog:a8 --theme "AIエージェントを動かすクラウド" --run-id a8-20261125
//   node --experimental-strip-types scripts/eve-run.mjs owner --run data/eve-runs/a8-20261125.json --step apply --json '{"affiliateUrl":"https://px.a8.net/..."}'
//   node --experimental-strip-types scripts/eve-run.mjs owner --run data/eve-runs/a8-20261125.json --step export:asp-a8 --csv-file ~/Downloads/a8.csv
//   node --experimental-strip-types scripts/eve-run.mjs continue --run data/eve-runs/a8-20261125.json
//   node --experimental-strip-types scripts/eve-run.mjs status --run data/eve-runs/a8-20261125.json
// 回の記録は data/eve-runs/private/<回の id>.json（Git に入れない。本人の広告リンク・売上の CSV が入るため。このリポジトリは公開）。
// 作った物（記事・画像・LP・ブログの一式）は、同じ名前のフォルダにも書き出す。本人の中身が入っていない回だけ、--dir data/eve-runs で画面に出せる。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { eveCombinationFile } from '../lib/eve-combination-catalog.ts';
import { eveDemandLedger } from '../lib/eve-demand.ts';
import { eveAdvanceRun, eveNewRun, eveRunSummary, eveSubmitOwner } from '../lib/eve-combination-run.ts';
import { evePartVersion, EVE_PART_FILES } from '../lib/eve-part-registry.ts';
import { eveLocalLlm } from '../lib/eve-part-llm.ts';
import { evePartRunners } from './eve-parts.mjs';

const [command] = process.argv.slice(2);
const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    combination: { type: 'string' }, theme: { type: 'string' }, 'run-id': { type: 'string' }, run: { type: 'string' }, dir: { type: 'string', default: 'data/eve-runs/private' },
    step: { type: 'string' }, json: { type: 'string' }, 'csv-file': { type: 'string' }, llm: { type: 'string', default: 'http://127.0.0.1:8787' },
  },
});
const root = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');

const llm = eveLocalLlm(values.llm);
let model = null;
async function modelName() {
  model ??= (await llm({ messages: [{ role: 'user', content: '「はい」とだけ答えてください。' }], maxTokens: 5, temperature: 0 })).model;
  return model;
}
const runners = evePartRunners(llm);
const deps = {
  call: async (ref, input) => {
    const run = runners[ref.ref];
    if (!run) throw new Error(`知らない部品です（${ref.ref}）。`);
    return { output: await run(input) };
  },
  versionOf: async (ref) => evePartVersion(ref, read, EVE_PART_FILES[ref]?.llm ? await modelName() : null),
};

function save(path, run, c) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(run, null, 2) + '\n');
  // 本人が開きやすいよう、作った物をファイルにも書き出す（記録の写し。正本は JSON）。
  const dir = path.replace(/\.json$/u, '');
  const out = (name, data) => { mkdirSync(dirname(resolve(dir, name)), { recursive: true }); writeFileSync(resolve(dir, name), data); };
  const s = run.steps;
  const value = (id) => s[id]?.output ?? s[id]?.prepared;
  for (const step of c.steps) {
    const v = value(step.id);
    if (!v) continue;
    if (step.capability === 'content.article' && typeof v === 'string') out('article.md', v);
    if (step.capability === 'content.image' && v.base64) out('eyecatch.png', Buffer.from(v.base64, 'base64'));
    if (step.capability === 'site.build' && typeof v === 'string') out('lp-template.html', v);
    if (step.capability === 'site.host' && Array.isArray(s[step.id]?.prepared?.files)) for (const f of s[step.id].prepared.files) out(`lp/${f.path}`, f.text ?? Buffer.from(f.base64, 'base64'));
    if (step.capability === 'publish.blog' && s[step.id]?.prepared?.wxr) { out('blog/post.xml', s[step.id].prepared.wxr); out('blog/post.html', s[step.id].prepared.html); }
  }
}

function report(c, run) {
  const sum = eveRunSummary(c, run);
  console.log(`回 ${run.runId}（${c.id} 版 ${c.version}）: 済み ${sum.done} / 本人の番 ${sum.owner} / 待ち ${sum.waiting} / 失敗 ${sum.failed} / 呼ばなかった ${sum.refused}（全 ${sum.total}）${sum.finished ? ' — 入金の確認まで済みました' : ''}`);
  for (const step of c.steps) {
    const r = run.steps[step.id];
    if (r && r.state !== 'done' && r.state !== 'waiting') console.log(`  [${r.state}] ${step.id}: ${r.reason}`);
  }
  for (const t of sum.ownerTurns) console.log(`  本人の番 ${t.id}「${t.label}」: ${t.ask?.reason ?? ''}\n    返す形: ${t.ask?.give ?? ''}`);
}

if (command === 'start') {
  const c = eveCombinationFile(values.combination ?? '');
  if (!c) throw new Error('組み合わせ（--combination）がありません。');
  if (!values.theme || !values['run-id']) throw new Error('--theme と --run-id が要ります。');
  const ledger = eveDemandLedger(JSON.parse(read('data/eve-demand/ledger.json')).entries, Date.now());
  const path = resolve(root, values.dir, `${values['run-id']}.json`);
  let run = eveNewRun(c, values['run-id'], { テーマ: values.theme, 需要の台帳: ledger.entries }, Date.now());
  run = await eveAdvanceRun(c, run, deps);
  save(path, run, c);
  report(c, run);
} else if (command === 'owner' || command === 'continue' || command === 'status') {
  if (!values.run) throw new Error('--run（回の記録の JSON）が要ります。');
  const path = resolve(values.run);
  let run = JSON.parse(readFileSync(path, 'utf8'));
  const c = eveCombinationFile(run.combinationId, run.version);
  if (!c) throw new Error('回の組み合わせ（版）が見つかりません。');
  if (command === 'owner') {
    const given = values['csv-file'] ? { csv: readFileSync(values['csv-file'], 'utf8') } : JSON.parse(values.json ?? '{}');
    run = await eveSubmitOwner(c, run, values.step ?? '', given, Date.now());
  }
  if (command !== 'status') {
    run = await eveAdvanceRun(c, run, deps);
    save(path, run, c);
  }
  report(c, run);
} else {
  console.log('使い方: start | owner | continue | status（ファイルの頭の説明を見てください）');
  process.exitCode = 2;
}
