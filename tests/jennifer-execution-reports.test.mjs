import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractJenniferReviewClaim,
  jenniferReviewClaimContract,
  parseJenniferReviewClaim,
} from '../lib/jennifer-execution-reports.ts';

const task = {
  id: 'task-inventory',
  evidence: [`jennifer:task-report:${'d'.repeat(64)}`],
  acceptanceCriteria: [
    { id: 'task-inventory-AC1', criterion: 'paths pinned', verification: 'hashes', status: 'pending', evidence: [] },
    { id: 'task-inventory-AC2', criterion: 'gaps listed', verification: 'report', status: 'pending', evidence: [] },
  ],
};

void test('review claims are exact, criterion-complete typed artifacts', () => {
  const claim = {
    schema: 'jennifer-review-claim/1',
    taskId: task.id,
    workerReportDigest: 'd'.repeat(64),
    accepted: true,
    summary: 'all criteria have evidence',
    criteria: task.acceptanceCriteria.map(({ id }) => ({
      criterionId: id,
      passed: true,
      evidenceRefs: [`artifact:${id}`],
    })),
    unresolved: [],
  };
  assert.deepEqual(parseJenniferReviewClaim(claim, task), claim);
  assert.deepEqual(extractJenniferReviewClaim({
    schemaVersion: 1,
    artifacts: [{ textParts: [JSON.stringify(claim)] }],
  }, task), claim);
  assert.equal(parseJenniferReviewClaim({ ...claim, taskId: 'other-task' }, task), null);
  assert.equal(parseJenniferReviewClaim(claim, task, 'e'.repeat(64)), null);
  assert.equal(parseJenniferReviewClaim({
    ...claim,
    criteria: claim.criteria.slice(0, 1),
  }, task), null);
  assert.equal(parseJenniferReviewClaim({
    ...claim,
    accepted: true,
    criteria: claim.criteria.map((item, index) => ({ ...item, passed: index !== 0 })),
  }, task), null);
});

void test('review prompt contract names every AMC criterion', () => {
  const contract = JSON.parse(jenniferReviewClaimContract(task));
  assert.equal(contract.schema, 'jennifer-review-claim/1');
  assert.equal(contract.workerReportDigest, 'd'.repeat(64));
  assert.deepEqual(
    contract.criteria.map(({ criterionId }) => criterionId),
    task.acceptanceCriteria.map(({ id }) => id),
  );
});
