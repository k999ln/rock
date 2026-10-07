import test from 'node:test';
import assert from 'node:assert/strict';
import { ADDONS_STORAGE_KEY, readAddons, setAddon } from '../lib/rockstar-addons.ts';
import { collectDevicePreferences, encryptDeviceBackup, decryptDeviceBackup } from '../lib/system-backup.ts';
function store() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), key: n => [...data.keys()][n] ?? null, get length() { return data.size; } }; }
void test('add/remove is explicit, idempotent and preserves other selected modules', () => {
 const s = store(); assert.deepEqual(readAddons(s), []);
 assert.deepEqual(setAddon(s,'data',true), ['data']);
 assert.deepEqual(setAddon(s,'data',true), ['data']);
 assert.deepEqual(setAddon(s,'llm',true), ['data','llm']);
 assert.deepEqual(setAddon(s,'data',false), ['llm']);
 assert.throws(() => setAddon(s,'shell',true));
});
void test('unknown or corrupted persisted modules cannot turn into executable destinations', () => {
 const s = store(); for(const raw of ['{}','["https://invalid.example"]','["llm","data","llm"]','x'.repeat(257)]) { s.setItem(ADDONS_STORAGE_KEY,raw); assert.throws(() => readAddons(s)); }
});
void test('failed storage writes do not report a successful addition', () => {
 const s = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
 assert.throws(() => setAddon(s,'data',true), /quota/);
});
void test('selected modules travel through the existing encrypted preferences backup', async () => {
 const s = store(); setAddon(s,'data',true); s.setItem('private-other-data','excluded');
 const data = await decryptDeviceBackup(await encryptDeviceBackup(collectDevicePreferences(s),'fixture-passphrase'), 'fixture-passphrase');
 assert.deepEqual(data.records, { [ADDONS_STORAGE_KEY]: '["data"]' });
});
