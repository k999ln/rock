import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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

// Run the shipped browser controller with actual export/preview helpers and only
// synthetic notes. Network/storage mutation fail immediately if introduced.
function browserExportHarness() {
  const elements = Object.fromEntries(['status', 'preview', 'consent', 'file', 'download', 'prepare', 'cancel']
    .map(name => [name, { textContent: '', checked: false, disabled: name === 'download', value: '',
      files: [], listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; } }]));
  const source = storage();
  const downloads = [], blobs = [], timers = [];
  const document = {
    querySelector(selector) { return elements[selector.match(/^\[data-migration-(.+)\]$/)?.[1]] ?? null; },
    createElement(tag) {
      assert.equal(tag, 'a');
      return { click() { downloads.push({ href: this.href, name: this.download }); } };
    },
  };
  const script = readFileSync(new URL('../src/pro-os.js', import.meta.url), 'utf8');
  runInNewContext(script.replace(/^import .*;\n/, ''), {
    createProLocalExport, previewProLocalExport, localStorage: source, document, Blob,
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic-export'; },
      revokeObjectURL(url) { assert.equal(url, 'blob:synthetic-export'); } },
    setTimeout(callback) { timers.push(callback); },
    fetch() { assert.fail('export must not upload or prefetch'); },
    open() { assert.fail('archive navigation requires a user-operated static link'); },
  });
  return { elements, source, downloads, blobs, timers,
    fire(name, event = 'click') { return elements[name].listeners[event](); } };
}

test('private archive entry has a fixed empty-payload URL, tab isolation and manual account consent instructions', () => {
  const page = readFileSync(new URL('../src/pages/pro/index.astro', import.meta.url), 'utf8');
  const section = page.match(/<section[^>]*aria-label="Private browser notes"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'private notes section remains accessible');
  const anchor = section.match(/<a\s[^>]*data-migration-archive[^>]*>/)?.[0];
  assert.ok(anchor, 'a real link is available without script-driven navigation');
  const attribute = name => anchor.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
  const destination = new URL(attribute('href'));
  assert.equal(destination.href, 'https://avoado.si/account/import/pro');
  assert.equal(destination.search, ''); assert.equal(destination.hash, '');
  assert.equal(attribute('target'), '_blank');
  assert.deepEqual(attribute('rel').split(/\s+/).sort(), ['noopener', 'noreferrer']);
  assert.equal(attribute('referrerpolicy'), 'no-referrer');
  assert.equal(attribute('data-astro-prefetch'), 'false');
  assert.doesNotMatch(anchor, /on\w+=|download=/i);
  assert.match(section, /sign in, and manually select the downloaded file again/);
  assert.match(section, /Confirm the destination account and give separate archive save consent there/);
  assert.match(section, /Export consent here does not authorize account storage/);
  assert.match(section, /original browser notes and downloaded file are retained/);
  assert.doesNotMatch(section, /Account migration is not connected/);
});

test('preview and consented export retain originals and guide manual archive without sending or opening anything', async () => {
  const h = browserExportHarness(), before = JSON.stringify(h.source.raw);
  assert.equal(h.downloads.length, 0);
  await h.fire('prepare');
  assert.equal(h.elements.download.disabled, false);
  assert.equal(h.elements.consent.checked, false);
  await h.fire('download');
  assert.equal(h.downloads.length, 0, 'file export still requires consent');
  h.elements.consent.checked = true;
  await h.fire('download');
  assert.equal(h.downloads.length, 1);
  assert.equal(h.downloads[0].href, 'blob:synthetic-export');
  assert.equal(h.downloads[0].name, 'avocadopro-local-import.json');
  const exported = await previewProLocalExport(await h.blobs[0].text());
  assert.deepEqual(exported.envelope.originals, h.source.raw);
  assert.match(h.elements.status.textContent, /no account data has been saved/);
  assert.match(h.elements.status.textContent, /sign in, manually select this file again/);
  assert.match(h.elements.status.textContent, /separate archive save consent/);
  h.timers.forEach(callback => callback());
  await h.fire('cancel');
  assert.equal(h.elements.preview.textContent, '');
  assert.equal(h.elements.download.disabled, true);
  assert.equal(h.elements.consent.checked, false);
  await h.fire('download');
  assert.equal(h.downloads.length, 1, 'cancelled preview cannot export');
  assert.equal(JSON.stringify(h.source.raw), before);
});

test('cancel and file replacement fence a delayed preview and reset export consent', async () => {
  const h = browserExportHarness(), before = JSON.stringify(h.source.raw);
  const serialized = JSON.stringify(await createProLocalExport(h.source));
  let finish;
  h.elements.file.files = [{ size: serialized.length, text: () => new Promise(resolve => { finish = resolve; }) }];
  const pending = h.fire('file', 'change');
  await h.fire('cancel');
  finish(serialized); await pending;
  assert.equal(h.elements.preview.textContent, '');
  assert.equal(h.elements.download.disabled, true);
  assert.equal(h.elements.consent.checked, false);
  assert.match(h.elements.status.textContent, /Cancelled/);
  await h.fire('prepare');
  h.elements.consent.checked = true;
  h.elements.file.files = [{ size: serialized.length, text: async () => serialized }];
  await h.fire('file', 'change');
  assert.equal(h.elements.consent.checked, false, 'new file requires fresh export consent');
  assert.equal(h.elements.download.disabled, false);
  await h.fire('download');
  assert.equal(h.downloads.length, 0);
  h.elements.file.files = [{ size: 2, text: async () => '{}' }];
  await h.fire('file', 'change');
  assert.equal(h.elements.download.disabled, true);
  assert.match(h.elements.status.textContent, /File rejected/);
  assert.equal(JSON.stringify(h.source.raw), before);
});
