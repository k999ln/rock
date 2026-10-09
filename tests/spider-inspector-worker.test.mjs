import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as inspector from '../toolkits/spider-guard/program-inspector.mjs';

const compiled = ts.transpileModule(
  readFileSync(
    new URL('../lib/spider-inspector-worker.ts', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  },
).outputText;
function worker() {
  const replies = [];
  const self = { postMessage: (value) => replies.push(value) };
  runInNewContext(compiled, { self, exports: {}, require: () => inspector });
  const send = (data, overrides = {}) =>
    self.onmessage({
      data,
      origin: '',
      source: null,
      isTrusted: true,
      ...overrides,
    });
  return { replies, send };
}
const valid = { id: 1, source: 'eval(input)', language: 'javascript' };
void test('dedicated SPIDER Worker returns only inspection metadata for validated messages', () => {
  const w = worker();
  w.send({
    ...valid,
    source: 'const password = "synthetic-worker-only";\neval(input)',
  });
  assert.equal(w.replies.length, 1);
  assert.equal(w.replies[0].id, 1);
  assert.equal(w.replies[0].report.counts.secret, 1);
  assert.equal(w.replies[0].report.counts.code, 1);
  assert.ok(!JSON.stringify(w.replies).includes('synthetic-worker-only'));
});
void test('SPIDER Worker ignores foreign, window and synthetic message events', () => {
  const w = worker();
  for (const override of [
    { origin: 'https://untrusted.invalid' },
    { source: {} },
    { isTrusted: false },
  ])
    w.send(valid, override);
  assert.equal(w.replies.length, 0);
});
void test('SPIDER Worker rejects malformed inputs and identifiers without reflecting values', () => {
  const w = worker();
  for (const data of [
    null,
    [],
    'raw-input',
    {},
    { ...valid, id: 'private-input' },
    { ...valid, id: {} },
    { ...valid, id: -1 },
    { ...valid, id: 1.5 },
    { ...valid, id: Infinity },
    { ...valid, source: {} },
    { ...valid, language: '__proto__' },
  ])
    w.send(data);
  assert.equal(w.replies.length, 0);
});
void test('SPIDER Worker reports over-limit inspection as failure without source or exception details', () => {
  const w = worker();
  w.send({ ...valid, source: 'x'.repeat(inspector.MAX_PROGRAM_BYTES + 1) });
  assert.equal(JSON.stringify(w.replies), '[{"id":1,"failed":true}]');
});
