import assert from 'node:assert/strict';
import { applyD1Migrations, introspectWorkflowInstance } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { it } from 'vitest';

it('keeps Remote AI Workflow dispatch closed and creates no provider-send claim', async () => {
  await applyD1Migrations(env.DB, JSON.parse(env.A2A_TEST_MIGRATIONS_JSON));
  const executionId = crypto.randomUUID();
  const instanceId = `llm-gate-${executionId}`;
  const workflow = await introspectWorkflowInstance(env.REMOTE_AI_TEXT_WORKFLOW, instanceId);
  try {
    await env.REMOTE_AI_TEXT_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: 'remote-ai-gate-fixture-owner', executionId },
    });
    await workflow.waitForStatus('complete');

    assert.deepEqual(await workflow.getOutput(), { outcome: 'execution_disabled' });
    const claims = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM remote_ai_text_send_claims WHERE execution_id = ?`).bind(executionId).first();
    assert.equal(claims.count, 0);
  } finally {
    await workflow.dispose();
  }
}, 30_000);
