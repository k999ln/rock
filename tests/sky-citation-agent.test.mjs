import assert from 'node:assert/strict';
import test from 'node:test';
import {
  citationInputSha256, completedCitationAgentJob, parseCitationAgentInput,
  runCitationAgent, SKY_CITATION_MAX_INPUT,
} from '../lib/sky-citation-agent.ts';

void test('phone-only citation agent creates a completed, saved workflow artifact', async () => {
  const input = parseCitationAgentInput({
    markdown: 'A claim. (Source: [Study](https://example.org/study))\n\nAnother claim. (Source: [Study](https://example.org/study))',
    language: 'en',
  });
  const hash = await citationInputSha256(input);
  const job = completedCitationAgentJob('2b84c775-e9a1-437b-aee4-71176f8f3154', input, hash);
  assert.equal(job.templateId, 'sky-citation-agent');
  assert.equal(job.status, 'completed');
  assert.equal(job.steps[0].passed, true);
  assert.deepEqual(job.events.map(({ command }) => command.action), ['record', 'complete']);
  assert.equal(job.standaloneAgent?.inputSha256, hash);
  assert.equal(job.standaloneAgent?.sourceCount, 1);
  assert.match(job.standaloneAgent?.text ?? '', /## Sources/);
  assert.equal((job.standaloneAgent?.text.match(/https:\/\/example.org\/study/g) ?? []).length, 1);
  assert.equal(job.standaloneAgent?.execution, 'first-party-rules');
});

void test('citation agent rejects oversized or malformed requests and identifies no-source output', () => {
  assert.throws(() => parseCitationAgentInput({ markdown: 'x'.repeat(SKY_CITATION_MAX_INPUT + 1), language: 'ja' }), /文字以内/);
  assert.throws(() => parseCitationAgentInput({ markdown: 'text', language: 'en', secret: 'x' }), /文字以内/);
  const output = runCitationAgent({ markdown: '本文だけ。', language: 'ja' });
  assert.equal(output.sourceCount, 0);
  assert.match(output.warnings.join(' '), /見つかりません/);
  assert.match(output.warnings.join(' '), /独立検証/);
});
