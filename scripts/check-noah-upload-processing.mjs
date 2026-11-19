import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { writeNoahArchive, readNoahArchive } from '../lib/noah-source-archive.ts';
import { noahAgentTemplate, noahSha256 } from '../lib/noah-agent-upload.ts';
const origin = 'http://127.0.0.1:3107';
const ownerResponse = await fetch(origin + '/api/noah/catalog/owner'); assert.equal(ownerResponse.status, 200);
const { ownerScope } = await ownerResponse.json();
const headers = { Origin: origin, 'X-Rock-Owner-Scope': ownerScope, 'Content-Type': 'application/json' };
const api = async (path, body) => { const r = await fetch(origin + path, { headers, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) }); const data = await r.json(); assert.ok(r.ok, `${path} ${r.status} ${JSON.stringify(data)}`); return data; };
const out = resolve('work/verification/noah-continuation-20261116/results'); await mkdir(out, { recursive: true });
const rows = [];
const cases = {
  typescript: { 'helper.ts': 'export function positive(n: number): boolean { if (n > 0) { return true; } else { return false; } }', 'agent.ts': "export {positive} from './helper.ts';", 'agent.test.mjs': "import test from 'node:test';import assert from 'node:assert/strict';import {positive} from './agent.ts';test('positive preserves zero and negative',()=>{assert.equal(positive(4),true);assert.equal(positive(0),false);assert.equal(positive(-2),false);});", 'LICENSE': 'Synthetic local test fixture. Not a published product.' },
  python: { 'helper.py': 'def positive(n):\n    if n > 0:\n        return True\n    else:\n        return False\n', 'agent.py': 'from helper import positive\n', 'test_agent.py': 'import unittest\nfrom agent import positive\nclass Check(unittest.TestCase):\n def test_positive(self):\n  self.assertTrue(positive(4))\n  self.assertFalse(positive(0))\n  self.assertFalse(positive(-2))\n', 'LICENSE': 'Synthetic local test fixture. Not a published product.' },
};
for (const [language, files] of Object.entries(cases)) {
  const id = language === 'typescript' && process.env.NOAH_RESUME_PROCESSING_ID || randomUUID(), name = `test-${language}.zip`;
  const bytes = writeNoahArchive(Object.entries(files).map(([name, content]) => ({ name, bytes: new TextEncoder().encode(content), os: 0, attrs: 0 })));
  let state = (await api('/__noah/upload-refactor', { id, name, base64: Buffer.from(bytes).toString('base64'), rightsConfirmed: true })).processing;
  const start = Date.now(); let last;
  while (!['complete', 'cancelled', 'failed'].includes(state.state) && Date.now() - start < 11 * 60 * 1000) {
    if (last !== state.state) { console.log(JSON.stringify({ language, id, state: state.state })); last = state.state; }
    await new Promise(resolve => setTimeout(resolve, 1000)); state = (await api(`/__noah/upload-refactor/${id}`)).processing;
  }
  console.log(JSON.stringify({ language, id, state: state.state, report: state.report, workId: state.workId }));
  assert.equal(state.state, 'complete');
  const receipt = await api(`/__noah/upload-refactor/${id}/receipt`, { token: state.receipt.token });
  const row = { language, id, workId: state.workId, report: receipt.report };
  rows.push(row); await writeFile(resolve(out, 'upload-processing-live.json'), JSON.stringify({ at: new Date().toISOString(), scope: 'actual local official Aider/model, isolated fixed tests, private upload; no market publication', rows }, null, 2) + '\n');
  assert.equal(receipt.report.validation, 'fixed_tests'); assert.ok(['refactored', 'unchanged'].includes(receipt.report.status));
  assert.ok(receipt.report.evidence.proposer.workId);
  const form = new FormData(); form.set('id', id); form.set('manifest', JSON.stringify({ ...noahAgentTemplate, id: 'test-refactor-' + language, name: '検証用・' + language + '登録時整理', adapter: 'source', endpointUrl: null, permissions: ['read_input', 'write_files'], summary: '固定テスト付きの登録時整理を確認するローカル試験用Agent。', priceNote: '試験用・販売なし' })); form.set('rightsConfirmed', 'true'); form.set('source', new File([new Uint8Array(bytes)], name)); form.set('processingReceipt', JSON.stringify(state.receipt));
  const saved = await fetch(origin + '/api/noah/agents', { method: 'POST', headers: { Origin: origin, 'X-Rock-Owner-Scope': ownerScope }, body: form, signal: AbortSignal.timeout(30000) });
  const data = await saved.json(); assert.ok([200, 201].includes(saved.status), JSON.stringify(data));
  assert.equal(data.agent.processing.validation, 'fixed_tests'); assert.equal(data.agent.original.sha256, await noahSha256(bytes));
  const originalResponse = await fetch(origin + `/api/noah/agents/${id}/source?variant=original`); assert.equal(originalResponse.status, 200); assert.deepEqual(new Uint8Array(await originalResponse.arrayBuffer()), bytes);
  const revisedResponse = await fetch(origin + `/api/noah/agents/${id}/source`); assert.equal(revisedResponse.status, 200); const revised = new Uint8Array(await revisedResponse.arrayBuffer()); assert.equal(await noahSha256(revised), data.agent.source.sha256);
  const revisedFiles = readNoahArchive(revised);
  for (const [file, content] of Object.entries(files)) if (file === 'LICENSE' || file.includes('test')) assert.equal(new TextDecoder().decode(revisedFiles.find(f => f.name === file).bytes), content);
  Object.assign(row, { persisted: true, originalSha256: data.agent.original.sha256, sourceSha256: data.agent.source.sha256, testsAndLicenseUnchanged: true });
  await writeFile(resolve(out, 'upload-processing-live.json'), JSON.stringify({ at: new Date().toISOString(), scope: 'actual local official Aider/model, isolated fixed tests, private upload; no market publication', rows }, null, 2) + '\n');
  console.log(JSON.stringify({ language, persisted: true, id }));
}
