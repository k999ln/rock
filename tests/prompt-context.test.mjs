import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRefs, collectCheckShas, refsUnchanged, selectPull, summarizeChecks } from '../scripts/prompt-context-model.mjs';

const repository = 'k999ln/rock';
const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const shaC = 'c'.repeat(40);
const shaD = 'd'.repeat(40);
const pull = (number, sha, source = repository) => ({
  number, state: 'open', mergedAt: null, url: `https://github.com/${repository}/pull/${number}`,
  base: 'main', head: `feature-${number}`, sha, repository: source,
});
const refs = () => ({
  main: shaA,
  branches: [{ name: 'main', sha: shaA }, { name: 'design', sha: shaB }],
  openPullRequests: [pull(2, shaC), pull(1, shaB)],
});

void test('check targets include a branch with no PR', () => {
  assert.deepEqual(collectCheckShas(repository, shaA, [{ name: 'design', sha: shaB }], []), [shaA, shaB]);
});

void test('check targets deduplicate main, branches and same-repository PRs, excluding fork heads', () => {
  assert.deepEqual(collectCheckShas(repository, shaA,
    [{ name: 'main', sha: shaA }, { name: 'design', sha: shaB }, { name: 'same-design', sha: shaB }],
    [pull(1, shaB), pull(2, shaC), pull(3, shaD, 'other/rock'), pull(4, shaD, null)]),
  [shaA, shaB, shaC]);
});

void test('ref comparison is stable across branch and PR ordering without mutating input', () => {
  const before = refs();
  const original = structuredClone(before);
  const after = { main: shaA, branches: [...before.branches].reverse(), openPullRequests: [...before.openPullRequests].reverse() };
  assert.equal(refsUnchanged(before, after), true);
  assert.deepEqual(canonicalRefs(before).branches.map((branch) => branch.name), ['design', 'main']);
  assert.deepEqual(canonicalRefs(before).openPullRequests.map((entry) => entry.number), [1, 2]);
  assert.deepEqual(before, original);
});

void test('ref comparison detects main, branch and PR changes', () => {
  const before = refs();
  for (const change of [
    (value) => { value.main = shaD; },
    (value) => { value.branches[1].sha = shaD; },
    (value) => { value.branches[1].name = 'renamed'; },
    (value) => { value.openPullRequests[0].sha = shaD; },
    (value) => { value.openPullRequests[0].base = 'release'; },
    (value) => { value.openPullRequests[0].repository = 'other/rock'; },
  ]) {
    const after = structuredClone(before);
    change(after);
    assert.equal(refsUnchanged(before, after), false);
  }
});

void test('ref comparison detects branch and PR additions and deletions', () => {
  const before = refs();
  for (const change of [
    (value) => { value.branches.pop(); },
    (value) => { value.branches.push({ name: 'new', sha: shaD }); },
    (value) => { value.openPullRequests.pop(); },
    (value) => { value.openPullRequests.push(pull(3, shaD)); },
  ]) {
    const after = structuredClone(before);
    change(after);
    assert.equal(refsUnchanged(before, after), false);
  }
});

void test('no check runs are explicitly not successful', () => {
  assert.deepEqual(summarizeChecks([]), { state: 'NO_CHECKS', total: 0, allSuccessful: false });
});

void test('only completed successful checks pass; pending, skipped, neutral and unknown results do not', () => {
  assert.deepEqual(summarizeChecks([{ status: 'completed', conclusion: 'success' }]),
    { state: 'PASS', total: 1, allSuccessful: true });
  assert.equal(summarizeChecks([{ status: 'in_progress', conclusion: null }]).state, 'INCOMPLETE');
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required', null, 'unexpected']) {
    assert.deepEqual(summarizeChecks([{ status: 'completed', conclusion }]),
      { state: 'NOT_PASS', total: 1, allSuccessful: false });
  }
  assert.equal(summarizeChecks([
    { status: 'completed', conclusion: 'success' }, { status: 'queued', conclusion: null },
  ]).allSuccessful, false);
});

void test('PR selection preserves commit identity and represents deleted source repositories explicitly', () => {
  const input = { number: 1, state: 'open', merged_at: null, html_url: 'https://github.com/k999ln/rock/pull/1',
    base: { ref: 'main' }, head: { ref: 'feature-1', sha: shaB, repo: { full_name: repository } } };
  assert.deepEqual(selectPull(input), pull(1, shaB));
  assert.equal(selectPull({ ...input, head: { ...input.head, repo: null } }).repository, null);
});
