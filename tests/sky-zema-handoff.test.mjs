import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeSkyZemaHandoff,
  queueSkyZemaHandoff,
  SKY_ZEMA_HANDOFF_KEY,
  SKY_ZEMA_HANDOFF_TTL_MS,
} from '../lib/sky-zema-handoff.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

void test('Sky request is consumed by the matching Zema Tool exactly once', () => {
  const storage = memoryStorage();
  queueSkyZemaHandoff(
    'mr-citations',
    ' この記事の出典を整理して ',
    storage,
    1_000,
  );
  assert.equal(consumeSkyZemaHandoff('other-tool', storage, 1_001), null);
  const handoff = consumeSkyZemaHandoff('mr-citations', storage, 1_001);
  assert.equal(handoff?.request, 'この記事の出典を整理して');
  assert.equal(handoff?.source, 'sky');
  assert.equal(storage.getItem(SKY_ZEMA_HANDOFF_KEY), null);
  assert.equal(consumeSkyZemaHandoff('mr-citations', storage, 1_002), null);
});

void test('expired, malformed and future handoffs are discarded', () => {
  const storage = memoryStorage();
  queueSkyZemaHandoff('coconala', '案件を見て', storage, 1_000);
  assert.equal(
    consumeSkyZemaHandoff(
      'coconala',
      storage,
      1_000 + SKY_ZEMA_HANDOFF_TTL_MS + 1,
    ),
    null,
  );
  assert.equal(storage.getItem(SKY_ZEMA_HANDOFF_KEY), null);

  storage.setItem(SKY_ZEMA_HANDOFF_KEY, '{broken');
  assert.equal(consumeSkyZemaHandoff('coconala', storage, 2_000), null);
  assert.equal(storage.getItem(SKY_ZEMA_HANDOFF_KEY), null);

  queueSkyZemaHandoff('coconala', '案件を見て', storage, 50_001);
  assert.equal(consumeSkyZemaHandoff('coconala', storage, 1_000), null);
  assert.equal(storage.getItem(SKY_ZEMA_HANDOFF_KEY), null);
});

void test('handoff validates Tool ids and caps private request text', () => {
  const storage = memoryStorage();
  assert.throws(
    () => queueSkyZemaHandoff('../unsafe', 'x', storage, 1_000),
    /Tool/,
  );
  const handoff = queueSkyZemaHandoff(
    'rockstar-csv-cleanup',
    'a'.repeat(2_100),
    storage,
    1_000,
  );
  assert.equal(handoff.request.length, 2_000);
});
