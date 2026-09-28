import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentControlPlane,
  CursorCloudAgentClient,
  JevAgentStrategyProvider,
  buildCursorAgentPrompt,
  evaluateAgentExecutionGate,
  validateAgentTaskInput,
} from '../lib/agent-control-plane.ts';

const task = (overrides = {}) =>
  validateAgentTaskInput({
    requestId: 'agent-control-test',
    title: 'Add agent orchestration',
    goal: 'Implement the smallest testable control-plane change.',
    repositoryUrl: 'https://github.com/k999ln/rock',
    startingRef: 'main',
    risk: 'low',
    dataClass: 'public',
    effect: 'repository-write',
    acceptanceCriteria: ['Tests pass', 'No direct main changes'],
    executionApproval: {
      approved: true,
      approvedAt: '2026-09-27T20:00:00-04:00',
      scope: 'repository-pr-only',
    },
    ...overrides,
  });

void test('repository writes require explicit PR-only approval', () => {
  const gated = evaluateAgentExecutionGate(
    task({ executionApproval: undefined }),
  );
  assert.equal(gated.launchAllowed, false);
  assert.equal(gated.code, 'approval_required');
});

void test('dangerous effects never launch through the coding control plane', async () => {
  const control = new AgentControlPlane();
  const receipt = await control.launch(
    task({
      effect: 'production-deploy',
      risk: 'high',
    }),
  );
  assert.equal(receipt.status, 'blocked');
  assert.equal(
    receipt.executionGate.code,
    'dangerous_effect_requires_owner',
  );
  assert.equal(receipt.plan.reviewMode, 'security');
});

void test('Jev workflow choices are clamped by deterministic risk policy', async () => {
  const jev = new JevAgentStrategyProvider('test-key', async () => ({
    answers: {
      strategy: {
        type: 'choice',
        choice: 'parallel-workers',
        probabilities: { 'parallel-workers': 0.96 },
      },
      reviewMode: {
        type: 'choice',
        choice: 'standard',
        probabilities: { standard: 0.94 },
      },
      workerCount: {
        type: 'choice',
        choice: '4',
        probabilities: { '4': 0.93 },
      },
    },
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  }));
  const control = new AgentControlPlane({ decisionProvider: jev });
  const receipt = await control.plan(
    task({
      risk: 'high',
      decisionConsent: {
        approved: true,
        approvedAt: '2026-09-27T20:00:00-04:00',
      },
    }),
  );
  assert.equal(receipt.plan.providerId, 'typesafe-jev');
  assert.equal(receipt.plan.strategy, 'verify-first');
  assert.equal(receipt.plan.reviewMode, 'security');
  assert.equal(receipt.plan.maxWorkers, 2);
});

void test('private task state stays off remote Jev and uses deterministic routing', async () => {
  let called = false;
  const provider = {
    id: 'typesafe-jev',
    async decide() {
      called = true;
      throw new Error('should not be called');
    },
  };
  const control = new AgentControlPlane({ decisionProvider: provider });
  const receipt = await control.plan(
    task({
      dataClass: 'owner-private',
      decisionConsent: {
        approved: true,
        approvedAt: '2026-09-27T20:00:00-04:00',
      },
    }),
  );
  assert.equal(called, false);
  assert.equal(receipt.plan.providerId, 'deterministic');
});

void test('Cursor launch creates a PR-only agent request with review subagents', async () => {
  let capturedUrl = '';
  let captured = undefined;
  const cursor = new CursorCloudAgentClient(
    'cursor-test-key',
    async (url, init) => {
      capturedUrl = String(url);
      captured = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          agent: {
            id: 'bc-test',
            url: 'https://cursor.com/agents/bc-test',
          },
          run: { id: 'run-test' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  );
  const control = new AgentControlPlane({ cursorClient: cursor });
  const receipt = await control.launch(task({ risk: 'medium', usePstack: true }));
  assert.equal(receipt.status, 'launched');
  assert.equal(receipt.agent?.id, 'bc-test');
  assert.equal(capturedUrl, 'https://api.cursor.com/v1/agents');
  assert.equal(captured.autoCreatePR, true);
  assert.equal(captured.repos[0].startingRef, 'main');
  assert.equal(captured.customSubagents.length >= 2, true);
  assert.match(captured.prompt.text, /Never merge the pull request/);
  assert.match(captured.prompt.text, /pstack/);
});

void test('prompt keeps model advice separate from execution authority', () => {
  const prompt = buildCursorAgentPrompt(
    task(),
    {
      strategy: 'single-worker',
      reviewMode: 'standard',
      maxWorkers: 1,
      confidence: 1,
      providerId: 'deterministic',
      reasonCode: 'test',
      authority: 'advisory-only',
    },
  );
  assert.match(prompt, /control-plane decision is advisory only/i);
  assert.match(prompt, /Never deploy to production/);
});
