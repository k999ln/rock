import assert from 'node:assert/strict';
import test from 'node:test';

const { createSkyZoomDemoArtifact, parseSkyZoomMeetingNotesArtifact } = await import('../lib/sky-add-zoom-artifact.ts');
const { organizeMeetingNotes } = await import('../lib/sky-add-zoom-demo.ts');

void test('manual notes produce a typed private panel artifact', () => {
  const result = organizeMeetingNotes('会議: 来週の予定\n決定: 月曜に確認\n担当: Kai');
  const artifact = createSkyZoomDemoArtifact(result);
  assert.equal(artifact.schema, 'sky.zoom.meeting-notes/1');
  assert.equal(artifact.inputSource, 'manual.text');
  assert.equal(artifact.returnSlot, 'embedded.private');
  assert.deepEqual(artifact.decisions, ['月曜に確認']);
  assert.deepEqual(artifact.owners, ['Kai']);
  assert.deepEqual(parseSkyZoomMeetingNotesArtifact(JSON.stringify(artifact)), artifact);
});

void test('rejects wrong schema, source, shared slot and oversized payload', () => {
  const base = createSkyZoomDemoArtifact(organizeMeetingNotes('決定: 決める'));
  for (const value of [
    { ...base, schema: 'sky.fitness.plan/1' },
    { ...base, inputSource: 'host.meeting-transcript' },
    { ...base, returnSlot: 'host.chat-message' },
    { ...base, owners: [''] },
    { ...base, summary: 'x'.repeat(6001) },
  ]) assert.equal(parseSkyZoomMeetingNotesArtifact(JSON.stringify(value)), null);
});
