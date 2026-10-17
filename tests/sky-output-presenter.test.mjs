import assert from 'node:assert/strict';
import test from 'node:test';
import { agentOutputText, agentOutputExportable } from '../lib/sky-output-presenter.ts';

void test('saved Agent text keeps artifact boundaries and does not include omitted file content', () => {
  const document = {
    artifacts: [
      { name: 'Research', description: 'Draft', textParts: ['First result'] },
      { name: 'Summary', textParts: ['Second result'] },
    ],
    omittedNonTextParts: 0,
    truncated: false,
  };
  assert.equal(agentOutputText(document), 'Research\n\nDraft\n\nFirst result\n\n---\n\nSummary\n\nSecond result');
  assert.equal(agentOutputExportable(document), true);
  assert.equal(agentOutputExportable({ ...document, omittedNonTextParts: 1 }), false);
  assert.equal(agentOutputExportable({ ...document, truncated: true }), false);
  assert.equal(agentOutputExportable({ ...document, artifacts: [{ textParts: ['  '] }] }), false);
});
