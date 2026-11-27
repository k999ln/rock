// 「まだ誰も動かしていない」Agent を動かして確かめる道具（task 129 の D6。scripts/noah-prod-unverified.mjs）。ここでは通信しない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noahUnverifiedKind, noahUnverifiedTargets } from '../scripts/noah-prod-unverified.mjs';

const script = fileURLToPath(new URL('../scripts/noah-prod-check.mjs', import.meta.url));

void test('結果の分け方: 動く・鍵が要る・入力が要る・読み取りだけの道具が無い・壊れている', () => {
  assert.equal(noahUnverifiedKind({ result: 'works' }), 'works');
  assert.equal(noahUnverifiedKind({ result: 'needs-key' }), 'needs-key');
  assert.equal(noahUnverifiedKind({ result: 'tool-failed', error: 'この Agent は、相手の許可が要るようになりました。まだ対応していません。' }), 'needs-key');
  assert.equal(noahUnverifiedKind({ result: 'tool-failed', error: 'unauthorized: sql needs an API key.' }), 'needs-key');
  assert.equal(noahUnverifiedKind({ result: 'tool-failed', error: 'Authentication required: connect your Entity Enricher account.' }), 'needs-key');
  assert.equal(noahUnverifiedKind({ result: 'tool-failed', error: 'Input validation error: Invalid arguments for tool search_companies' }), 'input-undeclared');
  assert.equal(noahUnverifiedKind({ result: 'tool-failed', error: '{"error":"Upstream data provider is rate limited. Retry in ~60 seconds"}' }), 'transient');
  assert.equal(noahUnverifiedKind({ result: 'tool-failed', error: 'Internal error' }), 'broken-tool');
  assert.equal(noahUnverifiedKind({ result: 'connect-failed', error: '相手のサーバーが応答しません。' }), 'broken-connect');
  assert.equal(noahUnverifiedKind({ result: 'needs-input' }), 'needs-input');
  assert.equal(noahUnverifiedKind({ result: 'no-read-only-tool' }), 'no-read-only-tool');
});

void test('確かめる物: ふだんは札が unverified の物だけ。--ids の時は、札にかかわらずその物だけ（落ちた物の確かめ直し）', () => {
  const families = [
    { id: 'a', connect: { badge: 'unverified' } },
    { id: 'b', connect: { badge: 'ran' } },
    { id: 'c', connect: { badge: 'unverified' } },
    { id: 'd' },
  ];
  assert.deepEqual(noahUnverifiedTargets(families).map((one) => one.id), ['a', 'c']);
  assert.deepEqual(noahUnverifiedTargets(families, { limit: 1 }).map((one) => one.id), ['a']);
  assert.deepEqual(noahUnverifiedTargets(families, { ids: ['b', 'd', 'zzz'] }).map((one) => one.id), ['b', 'd']);
});

void test('呼ぶのは、読み取りだけと宣言され、入力の要らない道具だけ', () => {
  const source = readFileSync(new URL('../scripts/noah-prod-unverified.mjs', import.meta.url), 'utf8');
  assert.match(source, /one\.usable && one\.readOnly && one\.required === 0 && !one\.needsConfirm/);
  assert.match(source, /input: \{\}/, '入力は空');
});

void test('--write が無ければ動かない', () => {
  const run = spawnSync(process.execPath, [script, 'unverified', 'https://example.invalid'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /--write/);
});
