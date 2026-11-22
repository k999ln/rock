import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceProject, projectCandidate, applyProjectCandidate } from '../lib/noah-source-project.ts';
import { writeNoahArchive, readNoahArchive } from '../lib/noah-source-archive.ts';
import { checkProjectTypes } from '../scripts/noah-project-validation.mjs';
import { refactorUploadProject } from '../scripts/noah-upload-refactor.mjs';
const encode = value => new TextEncoder().encode(value);
const zip = files => writeNoahArchive(Object.entries(files).map(([name, content]) => ({ name, bytes: encode(content), os: 0, attrs: 0 })));
const files = { 'repo/sum.ts': 'export const sum = (a: number, b: number) => a + b;', 'repo/plus.ts': "export {sum} from './sum.ts';", 'repo/sum.test.mjs': "import {sum} from './plus.ts';", 'repo/LICENSE': 'Original license', 'repo/noah-source.json': '{"commit":"fixed"}' };
const signal = () => new AbortController().signal;

await test('project pins test files and root; candidate preserves license, provenance and unchanged modules', async () => {
  const bytes = zip(files), original = await sourceProject('source.zip', bytes);
  assert.equal(original.root, 'repo'); assert.deepEqual(original.tests, ['repo/sum.test.mjs']);
  assert.deepEqual(checkProjectTypes(original), []);
  const candidate = await projectCandidate(original, { files: [{ name: 'repo/sum.ts', content: 'export function sum(a: number, b: number) { return a + b; }' }] });
  const saved = readNoahArchive(applyProjectCandidate('source.zip', bytes, candidate));
  for (const name of ['repo/LICENSE', 'repo/noah-source.json', 'repo/sum.test.mjs', 'repo/plus.ts']) assert.equal(new TextDecoder().decode(saved.find(f => f.name === name).bytes), files[name]);
  assert.notEqual(candidate.digest, original.digest);
});
await test('candidate cannot change tests, metadata, source membership, duplicates or field contract', async () => {
  const original = await sourceProject('source.zip', zip(files));
  for (const name of ['repo/sum.test.mjs', 'repo/LICENSE', 'repo/noah-source.json', '../outside.ts', 'repo/new.ts']) {
    await assert.rejects(projectCandidate(original, { files: [{ name, content: 'changed' }] }));
  }
  const edit = { name: 'repo/sum.ts', content: 'export const sum = 1;' };
  await assert.rejects(projectCandidate(original, { files: [edit, edit] }));
  await assert.rejects(projectCandidate(original, { files: [], command: 'run shell' }));
});
await test('type checker covers all editable modules and unresolved dependencies without reading host source', async () => {
  for (const code of ['export const broken: number = "wrong";', "import value from '/etc/private'; export {value};", "import dep from 'not-installed'; export {dep};"]) {
    const project = await sourceProject('source.zip', zip({ ...files, 'repo/other.ts': code }));
    assert.ok(checkProjectTypes(project).length);
  }
});
await test('Python source/tests and missing tests are classified without running uploaded code', async () => {
  const project = await sourceProject('source.zip', zip({ 'agent.py': 'def add(a,b): return a+b', 'test_agent.py': 'import unittest', 'tests/helper.py': '# unchanged helper' }));
  assert.deepEqual(project.tests, ['test_agent.py']); assert.deepEqual(project.editable, ['agent.py']);
  assert.deepEqual((await sourceProject('agent.py', encode('print(1)'))).tests, []);
  await assert.rejects(sourceProject('.env', encode('secret')));
  await assert.rejects(sourceProject('agent.py', new Uint8Array([255, 255, 255, 255])));
});
await test('pipeline validates baseline before model; failed baseline, changed tests and failed candidate retain byte-identical original', async () => {
  for (const failure of ['baseline', 'tests', 'candidate']) {
    const bytes = zip(files); let calls = 0, proposals = 0;
    const result = await refactorUploadProject({ name: 'source.zip', bytes, signal: signal(),
      validate: async () => ({ passed: ++calls !== (failure === 'baseline' ? 1 : failure === 'candidate' ? 2 : 100), stage: 'tests' }),
      propose: async () => { proposals++; return { value: { files: [{ name: failure === 'tests' ? 'repo/sum.test.mjs' : 'repo/sum.ts', content: 'changed' }] }, evidence: { fixture: true } }; },
    });
    assert.equal(result.report.status, 'failed'); assert.deepEqual(result.bytes, bytes);
    if (failure === 'baseline') assert.equal(proposals, 0);
  }
});
await test('accepted candidate records immutable tests, before/after evidence and changed source; cancellation never adopts', async () => {
  const bytes = zip(files); const seen = [];
  const options = { name: 'source.zip', bytes, signal: signal(), validate: async ({ project }) => { seen.push(project); return { passed: true, stage: 'tests', sourceSha256: project.digest }; },
    propose: async () => ({ value: { files: [{ name: 'repo/sum.ts', content: 'export function sum(a: number, b: number) { return a + b; }' }] }, evidence: { fixture: true } }) };
  const result = await refactorUploadProject(options);
  assert.equal(result.report.status, 'refactored'); assert.equal(result.report.validation, 'fixed_tests'); assert.equal(seen.length, 2);
  assert.deepEqual(seen[0].tests, seen[1].tests); assert.equal(result.report.evidence.fixedTests.length, 1);
  assert.notEqual(result.report.sourceSha256, result.report.originalSha256);
  const controller = new AbortController();
  await assert.rejects(refactorUploadProject({ ...options, signal: controller.signal, propose: async () => { controller.abort(); return { value: { files: [] } }; } }), { name: 'AbortError' });
});
