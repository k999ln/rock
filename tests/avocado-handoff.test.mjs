import test from 'node:test';
import assert from 'node:assert/strict';
import { avocadoResultEnvelope, parseAvocadoBrief } from '../lib/avocado-handoff.ts';

const token = '3f2d610a-9c27-4f06-b3dc-01e7fb7a731c';

void test('Sky accepts a legacy four-year month or an AMC task, but not both', () => {
  const month = parseAvocadoBrief({ type: 'avocado.sky.brief.v1', token, monthId: 'y1m2', brief: '月の依頼' });
  const task = parseAvocadoBrief({ type: 'avocado.sky.brief.v1', token, taskId: 'm12t6', brief: 'AMCの依頼' });
  assert.deepEqual(month, { kind: 'month', targetId: 'y1m2', token, brief: '月の依頼' });
  assert.deepEqual(task, { kind: 'amc', targetId: 'm12t6', token, brief: 'AMCの依頼' });
  assert.equal(parseAvocadoBrief({ type: 'avocado.sky.brief.v1', token, monthId: 'y1m2', taskId: 'm1t1', brief: '曖昧' }), null);
  assert.equal(parseAvocadoBrief({ type: 'avocado.sky.brief.v1', token, taskId: 'm13t1', brief: '無効' }), null);
  assert.equal(parseAvocadoBrief({ type: 'avocado.sky.brief.v1', token, taskId: 'm1t1', brief: '' }), null);
});

void test('Sky returns only the matching target identifier and bounded text', () => {
  assert.deepEqual(avocadoResultEnvelope({ kind: 'amc', targetId: 'm1t1', token }, '  下書き  '), {
    type: 'avocado.sky.result.v1', token, taskId: 'm1t1', summary: '下書き',
  });
  assert.deepEqual(avocadoResultEnvelope({ kind: 'month', targetId: 'y1m1', token }, '内容'), {
    type: 'avocado.sky.result.v1', token, monthId: 'y1m1', summary: '内容',
  });
  assert.equal(avocadoResultEnvelope({ kind: 'amc', targetId: 'm1t1', token }, 'あ'.repeat(2000)).summary.length, 1800);
});
