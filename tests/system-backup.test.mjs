import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDevicePreferences,
  decryptDeviceBackup,
  encryptDeviceBackup,
  resetDevicePreferences,
  restoreDevicePreferences,
  recoverDevicePreferences,
  SYSTEM_BACKUP_FORMAT,
} from '../lib/system-backup.ts';

class MemoryStorage {
  data = new Map();
  get length() {
    return this.data.size;
  }
  key(index) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  setItem(key, value) {
    this.data.set(String(key), String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
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

void test('device reset removes only allowlisted preferences', () => {
  const storage = new MemoryStorage();
  storage.setItem('rockstaros.home.preferences.v1', '{"wallpaper":"night"}');
  storage.setItem('rockstaros.private.future', 'keep-me');
  storage.setItem('unrelated', 'keep-me-too');
  resetDevicePreferences(storage);
  assert.equal(storage.getItem('rockstaros.home.preferences.v1'), null);
  assert.equal(storage.getItem('rockstaros.private.future'), 'keep-me');
  assert.equal(storage.getItem('unrelated'), 'keep-me-too');
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

const HOME = 'rockstaros.home.preferences.v1';
const ADDONS = 'rockstaros.addons.v1';
class FailingStorage extends MemoryStorage {
  failure = null;
  mutations = [];
  getItem(key) {
    this.failure?.('get', key);
    return super.getItem(key);
  }
  setItem(key, value) {
    this.failure?.('set', key, value);
    super.setItem(key, value);
    this.mutations.push({ action: 'set', key, value });
    this.failure?.('set_after', key, value);
  }
  removeItem(key) {
    this.failure?.('remove', key);
    super.removeItem(key);
    this.mutations.push({ action: 'remove', key });
    this.failure?.('remove_after', key);
  }
}
const originalPreferences = { [HOME]: 'old-home', [ADDONS]: 'old-addons' };
function failingStorage() {
  const storage = new FailingStorage();
  for (const [key, value] of Object.entries(originalPreferences))
    storage.setItem(key, value);
  storage.setItem('unrelated', 'must-stay');
  storage.mutations = [];
  return storage;
}
const quota = () =>
  Object.assign(new Error('synthetic quota failure'), {
    name: 'QuotaExceededError',
  });

void test('quota on second restore write keeps every original preference and unrelated data', () => {
  const storage = failingStorage();
  storage.failure = (action, key, value) => {
    if (action === 'set' && key === ADDONS && value === 'new-addons')
      throw quota();
  };
  assert.throws(
    () =>
      restoreDevicePreferences(storage, {
        [HOME]: 'new-home',
        [ADDONS]: 'new-addons',
      }),
    (error) => {
      assert.equal(error.recoveryPending, false);
      assert.match(error.message, /変更前の設定に戻しました/);
      return true;
    },
  );
  assert.equal(storage.getItem(HOME), 'old-home');
  assert.equal(storage.getItem(ADDONS), 'old-addons');
  assert.equal(storage.getItem('unrelated'), 'must-stay');
});

void test('all restore input is validated before any storage mutation', () => {
  const storage = failingStorage();
  assert.throws(
    () =>
      restoreDevicePreferences(storage, {
        [HOME]: 'new-home',
        secret: 'must-not-be-restored',
      }),
    /許可されていない/,
  );
  assert.deepEqual(storage.mutations, []);
  assert.deepEqual(collectDevicePreferences(storage), originalPreferences);
});

void test('storage read failure before restore/reset does not delete or write anything', () => {
  for (const operation of [
    (storage) => restoreDevicePreferences(storage, { [HOME]: 'new-home' }),
    (storage) => resetDevicePreferences(storage),
  ]) {
    const storage = failingStorage();
    storage.failure = (action, key) => {
      if (action === 'get' && key === ADDONS)
        throw new Error('synthetic Storage access failure');
    };
    // Read failure is checked independently for both operations below.
    assert.throws(() => operation(storage), /読み取れない/);
    assert.deepEqual(storage.mutations, []);
    assert.deepEqual(
      [...storage.data],
      [
        [HOME, 'old-home'],
        [ADDONS, 'old-addons'],
        ['unrelated', 'must-stay'],
      ],
    );
  }
});

void test('missing preferences remain absent after interrupted restore, and absent backup fields clear on success', () => {
  const storage = new FailingStorage();
  storage.setItem(ADDONS, 'old-addons');
  storage.mutations = [];
  storage.failure = (action, key, value) => {
    if (action === 'set' && key === ADDONS && value === 'new-addons')
      throw quota();
  };
  assert.throws(() =>
    restoreDevicePreferences(storage, {
      [HOME]: 'new-home',
      [ADDONS]: 'new-addons',
    }),
  );
  assert.equal(storage.getItem(HOME), null);
  assert.equal(storage.getItem(ADDONS), 'old-addons');
  storage.failure = null;
  restoreDevicePreferences(storage, { [HOME]: 'new-home' });
  assert.equal(storage.getItem(HOME), 'new-home');
  assert.equal(storage.getItem(ADDONS), null);
});

void test('failure after a remove mutation rolls every original setting back', () => {
  const storage = failingStorage();
  let failed = false;
  storage.failure = (action, key) => {
    if (!failed && action === 'remove_after' && key === ADDONS) {
      failed = true;
      throw new Error('synthetic post-remove fault');
    }
  };
  assert.throws(
    () => restoreDevicePreferences(storage, { [HOME]: 'new-home' }),
    /変更前の設定に戻しました/,
  );
  assert.deepEqual(collectDevicePreferences(storage), originalPreferences);
});

void test('rollback failure preserves immutable original snapshot and explicit retry recovers it', async () => {
  const storage = failingStorage();
  storage.failure = (action, key, value) => {
    if (
      action === 'set' &&
      ((key === ADDONS && value === 'new-addons') ||
        (key === HOME && value === 'old-home'))
    )
      throw quota();
  };
  assert.throws(() =>
    restoreDevicePreferences(storage, {
      [HOME]: 'new-home',
      [ADDONS]: 'new-addons',
    }),
  );
  let retained;
  try {
    restoreDevicePreferences(storage, { [HOME]: 'another-value' });
  } catch (error) {
    retained = error;
  }
  assert.equal(retained.recoveryPending, true);
  assert.match(retained.message, /画面を閉じず/);
  assert.deepEqual(retained.originalRecords, originalPreferences);
  assert.equal(Object.isFrozen(retained.originalRecords), true);
  assert.equal(JSON.stringify(retained).includes('old-home'), false);
  assert.equal(JSON.stringify(retained).includes('old-addons'), false);
  assert.throws(() => {
    retained.originalRecords[HOME] = 'overwrite-snapshot';
  }, TypeError);
  assert.equal(storage.getItem(HOME), 'new-home');
  storage.failure = null;
  assert.equal(recoverDevicePreferences(storage), true);
  assert.deepEqual(collectDevicePreferences(storage), originalPreferences);
  assert.equal(recoverDevicePreferences(storage), false);
});

void test('next restore recovers the pending original before applying a fresh backup', async () => {
  const storage = failingStorage();
  storage.failure = (action, key, value) => {
    if (
      action === 'set' &&
      ((key === ADDONS && value === 'new-addons') || value === 'old-home')
    )
      throw quota();
  };
  assert.throws(() =>
    restoreDevicePreferences(storage, {
      [HOME]: 'new-home',
      [ADDONS]: 'new-addons',
    }),
  );
  storage.failure = null;
  storage.mutations = [];
  restoreDevicePreferences(storage, {
    [HOME]: 'fresh-home',
    [ADDONS]: 'fresh-addons',
  });
  assert.equal(storage.mutations[0].value, 'old-home');
  assert.equal(storage.getItem(HOME), 'fresh-home');
  assert.equal(storage.getItem(ADDONS), 'fresh-addons');
});

void test('successful explicit reset discards pending recovery and never resurrects old settings', async () => {
  const storage = failingStorage();
  storage.failure = (action, key, value) => {
    if (
      action === 'set' &&
      ((key === ADDONS && value === 'new-addons') || value === 'old-home')
    )
      throw quota();
  };
  assert.throws(() =>
    restoreDevicePreferences(storage, {
      [HOME]: 'new-home',
      [ADDONS]: 'new-addons',
    }),
  );
  storage.failure = null;
  resetDevicePreferences(storage);
  assert.equal(recoverDevicePreferences(storage), false);
  assert.equal(storage.getItem(HOME), null);
  assert.equal(storage.getItem(ADDONS), null);
  storage.mutations = [];
  restoreDevicePreferences(storage, { [HOME]: 'fresh-home' });
  assert.equal(
    storage.mutations.some(
      (change) => change.value === 'old-home' || change.value === 'old-addons',
    ),
    false,
  );
  assert.equal(storage.getItem('unrelated'), 'must-stay');
});

void test('partial reset failure restores original preferences and retains a prior failed-restore snapshot', async () => {
  const storage = failingStorage();
  let failed = false;
  storage.failure = (action, key) => {
    if (!failed && action === 'remove_after' && key === ADDONS) {
      failed = true;
      throw quota();
    }
  };
  assert.throws(
    () => resetDevicePreferences(storage),
    /変更前の設定に戻しました/,
  );
  assert.deepEqual(collectDevicePreferences(storage), originalPreferences);
  storage.failure = (action, key, value) => {
    if (
      action === 'set' &&
      ((key === ADDONS && value === 'new-addons') || value === 'old-home')
    )
      throw quota();
  };
  assert.throws(() =>
    restoreDevicePreferences(storage, {
      [HOME]: 'new-home',
      [ADDONS]: 'new-addons',
    }),
  );
  storage.failure = (action, key) => {
    if (action === 'remove' && key === ADDONS) throw quota();
  };
  assert.throws(
    () => resetDevicePreferences(storage),
    (error) => {
      assert.equal(error.recoveryPending, true);
      assert.deepEqual(error.originalRecords, originalPreferences);
      return true;
    },
  );
  storage.failure = null;
  assert.equal(recoverDevicePreferences(storage), true);
  assert.deepEqual(collectDevicePreferences(storage), originalPreferences);
});

void test('failure after a set mutation restores every original value', () => {
  const storage = failingStorage();
  let failed = false;
  storage.failure = (action, key) => {
    if (!failed && action === 'set_after' && key === HOME) {
      failed = true;
      throw quota();
    }
  };
  assert.throws(
    () =>
      restoreDevicePreferences(storage, {
        [HOME]: 'new-home',
        [ADDONS]: 'new-addons',
      }),
    /変更前の設定に戻しました/,
  );
  assert.deepEqual(collectDevicePreferences(storage), originalPreferences);
});

void test('invalid subsequent backup cannot replace or mutate an interrupted original snapshot', () => {
  const storage = failingStorage();
  storage.failure = (action, key, value) => {
    if (
      action === 'set' &&
      ((key === ADDONS && value === 'new-addons') || value === 'old-home')
    )
      throw quota();
  };
  assert.throws(() =>
    restoreDevicePreferences(storage, {
      [HOME]: 'new-home',
      [ADDONS]: 'new-addons',
    }),
  );
  storage.mutations = [];
  assert.throws(
    () =>
      restoreDevicePreferences(storage, {
        [HOME]: 'other-home',
        forbidden: 'other-record',
      }),
    /許可されていない/,
  );
  assert.deepEqual(storage.mutations, []);
  storage.failure = null;
  assert.equal(recoverDevicePreferences(storage), true);
  assert.deepEqual(collectDevicePreferences(storage), originalPreferences);
});
