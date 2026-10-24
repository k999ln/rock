import test from 'node:test';
import assert from 'node:assert/strict';
import { skyAgentEvePath } from '../lib/sky-agent-library.ts';

// Source Smith regression subset: existing main routing remains authoritative.
// A link is not authenticated access, dispatch, approval or a revision upgrade.
void test('saved Agent references preserve IDs, exact revision and optional source Tool on main links', () => {
  for (const reference of [
    { id: 'tool:mr-citations', revision: 0, sourceTool: 'mr-citations' },
    { id: '11111111-1111-4111-8111-111111111111', revision: 7 },
  ]) {
    const before = structuredClone(reference);
    const link = new URL(skyAgentEvePath(reference), 'https://fixture.invalid');
    assert.equal(link.pathname, '/chat');
    assert.equal(link.searchParams.get('agent'), reference.id);
    assert.equal(link.searchParams.get('agentRevision'), String(reference.revision));
    assert.equal(link.searchParams.get('tool'), reference.sourceTool ?? null);
    assert.deepEqual(reference, before);
  }
});
