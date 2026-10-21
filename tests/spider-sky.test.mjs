import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inspectProgram } from '../toolkits/spider-guard/program-inspector.mjs';
import { catalog } from '../lib/catalog.ts';
import { skyToolExecutionScope } from '../lib/sky-tool-execution-scope.ts';
import { skyToolUiState } from '../lib/sky-tool-ui.ts';
import { startSpiderInspection, finishSpiderInspection, acknowledgeSpiderInspection, cancelSpiderInspection } from '../lib/spider-workflow.ts';
import { applyWorkCommand } from '../lib/workflow.ts';

void test('Sky exposes the real local inspector through the common Zema tool route', () => {
  const tool = catalog.find(({ id }) => id === 'rockstar-spider');
  assert.ok(tool);
  assert.equal(tool.launchPath, '/zema/tools/rockstar-spider');
  assert.equal(skyToolExecutionScope(tool), 'browser-processing');
  assert.equal(skyToolUiState(tool, { service: { database: 'unavailable' } }).label, 'ブラウザ内で検査');
});

void test('inspection results and workflow receipts never retain supplied code or secret values', () => {
  const secret = 'synthetic-spider-private-value';
  const report = inspectProgram(`throw new Error('must never execute');\nconst password = "${secret}";\neval(userInput);`);
  assert.ok(report.counts.secret > 0);
  assert.ok(report.counts.code > 0);
  const job = startSpiderInspection(randomUUID());
  assert.throws(() => acknowledgeSpiderInspection(job));
  const inspected = finishSpiderInspection(job, report, 10);
  assert.equal(inspected.status, 'review');
  assert.equal(inspected.events[0].command.outcome, 'passed');
  const completed = acknowledgeSpiderInspection(inspected);
  assert.equal(completed.status, 'completed');
  assert.match(completed.events.at(-1).command.note, /安全認定・送信承認ではない/);
  assert.ok(!JSON.stringify({ report, completed }).includes(secret));
  assert.ok(!JSON.stringify(completed).includes('userInput'));
});

void test('partial or sample inspection cannot become a completed real inspection', () => {
  const report = inspectProgram('const answer = 42;');
  for (const [candidate, sample] of [[{ ...report, coverageLimited: true, state: 'incomplete' }, false], [report, true]]) {
    const job = finishSpiderInspection(startSpiderInspection(randomUUID()), candidate, 12, sample);
    assert.equal(job.status, 'active');
    assert.throws(() => acknowledgeSpiderInspection(job));
  }
});

void test('stopped inspections reject late results and revision conflicts remain enforced', () => {
  const job = startSpiderInspection(randomUUID());
  const stopped = cancelSpiderInspection(job);
  assert.equal(stopped.status, 'cancelled');
  assert.throws(() => finishSpiderInspection(stopped, inspectProgram('plain text', { language: 'text' }), 10));
  const inspected = finishSpiderInspection(job, inspectProgram('const answer = 42;'), 10);
  assert.throws(() => applyWorkCommand(inspected, { id: randomUUID(), action: 'complete', note: '確認' }, 0), /別の操作/);
  assert.deepEqual(finishSpiderInspection(job, inspectProgram('const answer = 42;'), 10).steps, inspected.steps);
});

void test('HTML-shaped hostile input stays data and report metadata excludes it', () => {
  const input = '<img src=x onerror="alert(1)">\npassword = "spider-fixture-only"';
  const report = inspectProgram(input, { language: 'text' });
  assert.ok(report.counts.secret > 0);
  assert.ok(!JSON.stringify(report).includes('<img'));
  assert.ok(!JSON.stringify(report).includes('spider-fixture-only'));
});
