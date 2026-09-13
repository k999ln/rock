import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDevicePreferences,
  decryptDeviceBackup,
  encryptDeviceBackup,
  restoreDevicePreferences,
  SYSTEM_BACKUP_FORMAT,
} from '../lib/system-backup.ts';

class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(key); }
}

void test('encrypted device backup round-trips only RockstarOS preferences', async () => {
  const source = new MemoryStorage();
  source.setItem('rockstaros.home.preferences.v1', '{"wallpaper":"night"}');
  source.setItem('unrelated', 'must-not-leave-device');
  const encrypted = await encryptDeviceBackup(
    collectDevicePreferences(source),
    'correct horse battery staple',
    '2026-09-12T00:00:00.000Z',
  );
  assert.equal(encrypted.includes('night'), false);
  const restored = await decryptDeviceBackup(
    encrypted,
    'correct horse battery staple',
  );
  assert.equal(restored.format, SYSTEM_BACKUP_FORMAT);
  assert.deepEqual(restored.records, {
    'rockstaros.home.preferences.v1': '{"wallpaper":"night"}',
  });
  const destination = new MemoryStorage();
  destination.setItem('rockstaros.private.future', 'keep-me-too');
  destination.setItem('unrelated', 'keep-me');
  restoreDevicePreferences(destination, restored.records);
  assert.equal(destination.getItem('rockstaros.private.future'), 'keep-me-too');
  assert.equal(destination.getItem('unrelated'), 'keep-me');
  assert.equal(
    destination.getItem('rockstaros.home.preferences.v1'),
    '{"wallpaper":"night"}',
  );
});

void test('backup rejects wrong passphrases, tampering and foreign records', async () => {
  const encrypted = await encryptDeviceBackup(
    { 'rockstaros.home.preferences.v1': '{}' },
    'a secure recovery phrase',
  );
  await assert.rejects(
    decryptDeviceBackup(encrypted, 'the wrong recovery phrase'),
    /パスフレーズ|改ざん/,
  );
  const envelope = JSON.parse(encrypted);
  envelope.ciphertext = envelope.ciphertext.slice(0, -4) + 'AAAA';
  await assert.rejects(
    decryptDeviceBackup(JSON.stringify(envelope), 'a secure recovery phrase'),
    /パスフレーズ|改ざん/,
  );
  await assert.rejects(
    encryptDeviceBackup({ secret: 'no' }, 'a secure recovery phrase'),
    /許可されていない/,
  );
  await assert.rejects(
    encryptDeviceBackup(
      { 'rockstaros.private.future': 'no' },
      'a secure recovery phrase',
    ),
    /許可されていない/,
  );
});
