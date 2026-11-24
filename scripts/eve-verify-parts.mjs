#!/usr/bin/env node
// Eve が作った部品を、候補と同じ見本の仕事と Jev の判定で確かめる（task 130、2026-11-24）。1 つの部品に 1 回だけ。呼び直さない。
// LLM を使う部品は、手元の Qwen（scripts/eve-local-llm.py）で動かす。部品の版は「部品のコード + モデルの hash」から作るので、
// 別のモデルで動かす時は版が変わり、確かめ直すまで工程に当てない。
//
// 使い方: python3 scripts/eve-local-llm.py <qwen.gguf> &  の後に
//   node --experimental-strip-types scripts/eve-verify-parts.mjs [--llm http://127.0.0.1:8787] [--out data/eve-verifications/2026-11-24-parts.json] [--write]
//   --write の時だけ、通った部品を data/noah-business-capabilities.json に足す。--only content.script のように、能力を絞れる（通った版を確かめ直さない）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { EVE_VERIFY_TASKS, eveMergeVerified, eveVerifyCapability } from '../lib/eve-verify.ts';
import { EVE_PART_RESULTS_REF, eveReadResults } from '../lib/eve-part-results.ts';
import { EVE_PART_SCRIPT_REF, eveWriteScript } from '../lib/eve-part-writer.ts';
import { EVE_PART_RESEARCH_REF, eveResearchKeywords } from '../lib/eve-part-research.ts';
import { eveLocalLlm } from '../lib/eve-part-llm.ts';
import { EVE_PART_ADCHECK_REF, eveCheckAd } from '../lib/eve-part-adcheck.ts';
import { EVE_PART_TERMS_REF, eveReadTerms } from '../lib/eve-part-terms.ts';

const { values } = parseArgs({ options: { llm: { type: 'string', default: 'http://127.0.0.1:8787' }, out: { type: 'string', default: `data/eve-verifications/${new Date().toISOString().slice(0, 10)}-parts.json` }, write: { type: 'boolean', default: false }, only: { type: 'string' } } });
const root = resolve(import.meta.dirname, '..');
const source = (...files) => files.map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n');
const sha = (text) => createHash('sha256').update(text).digest('hex');

const llm = eveLocalLlm(values.llm);
const probe = await llm({ messages: [{ role: 'user', content: '「はい」とだけ答えてください。' }], maxTokens: 5, temperature: 0 });
const model = probe.model;

const parts = {
  'tracking.results': { ref: EVE_PART_RESULTS_REF, files: ['lib/eve-part-results.ts'], llm: false, run: async (input) => eveReadResults(input) },
  'content.script': { ref: EVE_PART_SCRIPT_REF, files: ['lib/eve-part-writer.ts', 'lib/eve-part-llm.ts'], llm: true, run: async (input) => (await eveWriteScript(input, llm)).text },
  'research.market': { ref: EVE_PART_RESEARCH_REF, files: ['lib/eve-part-research.ts', 'lib/eve-part-llm.ts'], llm: true, run: async (input) => eveResearchKeywords(input, { llm }) },
  'research.terms': { ref: EVE_PART_TERMS_REF, files: ['lib/eve-part-terms.ts', 'lib/eve-part-adcheck.ts', 'lib/eve-part-writer.ts', 'lib/eve-part-llm.ts'], llm: true, run: async (input) => eveReadTerms(input, { llm }) },
  'compliance.check': { ref: EVE_PART_ADCHECK_REF, files: ['lib/eve-part-adcheck.ts', 'lib/eve-part-writer.ts', 'lib/eve-part-llm.ts'], llm: false, run: async (input) => eveCheckAd(input) },
};

const record = { schema: 'eve-verifications/1', at: new Date().toISOString(), kind: 'eve-parts', model, note: 'Eve が作った部品を、Noah の候補と同じ見本の仕事と Jev の判定で 1 回ずつ確かめた記録。部品の出力は Eve の物なので見本として残す。', parts: [] };
const results = [];
for (const task of EVE_VERIFY_TASKS.filter((t) => !values.only || values.only.split(',').includes(t.capability))) {
  const part = parts[task.capability];
  const version = sha(source(...part.files) + (part.llm ? `\nmodel:${model}` : ''));
  const ref = { ref: part.ref, version, tool: 'run' };
  let sample = null;
  const started = Date.now();
  const [verification] = await eveVerifyCapability(task, [ref], async (_ref, input) => {
    const output = await part.run(input);
    sample = output;
    return { output };
  });
  results.push(verification);
  record.parts.push({ capability: task.capability, ref: part.ref, version, files: part.files, model: part.llm ? model : null, ms: Date.now() - started, verification, sample });
  console.log(`${task.capability}\t${part.ref}\t${verification.ok ? 'pass' : 'FAIL'}\t${verification.reason}`);
}
// 前の回の記録は消さない（落ちた版も残す）。同じファイルの runs に足す。
const outPath = resolve(root, values.out);
mkdirSync(dirname(outPath), { recursive: true });
let file = { schema: 'eve-verifications/1', kind: 'eve-parts', note: record.note, runs: [] };
try { file = JSON.parse(readFileSync(outPath, 'utf8')); } catch { /* 最初の回 */ }
file.runs.push({ at: record.at, model: record.model, parts: record.parts });
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
if (values.write) {
  const capPath = resolve(root, 'data/noah-business-capabilities.json');
  const merged = eveMergeVerified(JSON.parse(readFileSync(capPath, 'utf8')), results);
  writeFileSync(capPath, JSON.stringify(merged, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, of: results.length, out: values.out, wrote: values.write }));
