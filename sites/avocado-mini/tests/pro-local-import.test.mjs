import test from 'node:test';
import assert from 'node:assert/strict';
import { createProLocalExport, previewProLocalExport, PRO_LOCAL_KEYS as keys } from '../src/pro-local-import.mjs';
function storage(draft = '原文\n  draft', tasks = JSON.stringify([{ id: 'old-1', text: 'a'.repeat(160), done: true }], null, 2)) {
  const raw = { [keys[0]]: draft, [keys[1]]: tasks };
  return { raw, getItem: key => raw[key], setItem() { assert.fail('must not write'); }, removeItem() { assert.fail('must not delete'); } };
}
test('raw originals roundtrip unchanged with deterministic operation, full text and legacy provenance', async () => {
  const source = storage(); const before = JSON.stringify(source.raw);
  const envelope = await createProLocalExport(source);
  assert.deepEqual(envelope, await createProLocalExport(source));
  const result = await previewProLocalExport(JSON.stringify(envelope));
  assert.deepEqual(result.envelope.originals, source.raw);
  assert.equal(result.items[0].objective.length, 160);
  assert.equal(result.items[0].legacyChecked, true);
  assert.equal(result.items[0].proposedState, 'draft');
  assert.equal(result.accountMigration, 'not_connected');
  assert.equal(JSON.stringify(source.raw), before);
});
test('absent keys are distinct from empty keys; max draft and 100 items survive', async () => {
  const empty = await createProLocalExport(storage(null, null));
  assert.equal(empty.originals[keys[0]], null);
  assert.notEqual(empty.contentSha256, (await createProLocalExport(storage('', '[]'))).contentSha256);
  const result = await previewProLocalExport(JSON.stringify(await createProLocalExport(storage('x'.repeat(3000), JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'x', done: false })))))));
  assert.equal(result.draft.length, 3000); assert.equal(result.items.length, 100);
});
test('reject modified digest, operation, original, schema, owner injection and unknown fields', async () => {
  const base = await createProLocalExport(storage());
  for (const mutate of [e => e.schema = 'pro-local-import/2', e => e.owner = 'victim', e => e.contentSha256 = '0'.repeat(64), e => e.operationId = 'other', e => e.originals[keys[0]] += 'modified', e => e.originals.extra = 'x']) {
    const envelope = structuredClone(base); mutate(envelope);
    await assert.rejects(previewProLocalExport(JSON.stringify(envelope)));
  }
});
test('strict original parser rejects malformed/excess records without filtering or truncating', async () => {
  for (const source of [storage('x'.repeat(3001)), storage('bad\0'), storage('\ud800'), storage('', '{'), storage('', '{}'), storage('', JSON.stringify([{id:'a',text:'ok',done:true,extra:1}])), storage('', JSON.stringify([{id:'a',text:'x'.repeat(161),done:false}])), storage('', JSON.stringify([{id:'a\n',text:'x',done:false}])), storage('', JSON.stringify([{id:'a',text:'x',done:'true'}])), storage('', JSON.stringify(Array.from({length:2},()=>({id:'same',text:'x',done:false})))), storage('', JSON.stringify(Array.from({length:101},(_,i)=>({id:String(i),text:'x',done:false}))))]) {
    const before = JSON.stringify(source.raw);
    await assert.rejects(createProLocalExport(source)); assert.equal(JSON.stringify(source.raw), before);
  }
  await assert.rejects(previewProLocalExport(' '.repeat(262145)));
  await assert.rejects(createProLocalExport({getItem(){throw Error('denied');}}));
});
