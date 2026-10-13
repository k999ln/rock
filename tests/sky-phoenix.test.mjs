import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendSkyPhoenixEvent,
  buildSkyPhoenixPredictions,
  clearSkyPhoenixHistory,
  emptySkyPhoenixState,
  isSkyPhoenixEvent,
  readSkyPhoenixState,
  setSkyPhoenixEnabled,
  SKY_PHOENIX_MAX_EVENTS,
  SKY_PHOENIX_RETENTION_MS,
  writeSkyPhoenixState,
} from '../lib/sky-phoenix.ts';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const now = 1_800_000_000_000;
const sessionId = '10000000-0000-4000-8000-000000000001';
const event = (id, type = 'launch', extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  sessionId,
  toolId: 'coconala',
  type,
  at: now - id,
  ...extra,
});

void test('history is explicit opt-in and duplicate event IDs converge', () => {
  const target = storage();
  assert.deepEqual(readSkyPhoenixState(target, now), emptySkyPhoenixState());
  appendSkyPhoenixEvent(target, event(1), now);
  assert.equal(readSkyPhoenixState(target, now).events.length, 0);
  setSkyPhoenixEnabled(target, true, now);
  appendSkyPhoenixEvent(target, event(1), now);
  appendSkyPhoenixEvent(target, event(1), now);
  const state = readSkyPhoenixState(target, now);
  assert.equal(state.enabled, true);
  assert.equal(state.events.length, 1);
});

void test('history rejects private fields, future events and exact dwell on actions', () => {
  assert.equal(
    isSkyPhoenixEvent({ ...event(1), prompt: 'secret' }, now),
    false,
  );
  assert.equal(
    isSkyPhoenixEvent({ ...event(1), at: now + 30_001 }, now),
    false,
  );
  assert.equal(isSkyPhoenixEvent({ ...event(1), dwellMs: 10_000 }, now), false);
  assert.equal(
    isSkyPhoenixEvent(event(1, 'impression', { dwellMs: 10_000 }), now),
    true,
  );
});

void test('storage keeps only the bounded 30-day learning window', () => {
  const target = storage();
  const events = Array.from(
    { length: SKY_PHOENIX_MAX_EVENTS + 20 },
    (_, index) => event(index + 1),
  );
  events.push({ ...event(9999), at: now - SKY_PHOENIX_RETENTION_MS - 1 });
  writeSkyPhoenixState(
    target,
    { ...emptySkyPhoenixState(), enabled: true, events },
    now,
  );
  const state = readSkyPhoenixState(target, now);
  assert.equal(state.events.length, SKY_PHOENIX_MAX_EVENTS);
  assert.ok(
    state.events.every((item) => item.at >= now - SKY_PHOENIX_RETENTION_MS),
  );
});

void test('multi-action model produces distinct probabilities and category learning', () => {
  const tools = [
    { id: 'coconala', category: '案件・納品支援' },
    { id: 'mr-delivery', category: '案件・納品支援' },
    { id: 'faster-whisper', category: '音声・映像' },
  ];
  const events = [
    event(1, 'detail'),
    event(2, 'launch'),
    event(3, 'save'),
    event(4, 'connect'),
  ];
  const predictions = buildSkyPhoenixPredictions(tools, events, now);
  const direct = predictions.get('coconala');
  const related = predictions.get('mr-delivery');
  const unrelated = predictions.get('faster-whisper');
  assert.notEqual(direct.connect, direct.detail);
  assert.ok(direct.connect > 0 && direct.detail > 0);
  assert.ok(direct.score > related.score);
  assert.ok(related.score > unrelated.score);
  assert.equal(direct.reason, 'frequent-tool');
  assert.equal(related.reason, 'preferred-category');
});

void test('clear removes learned events without silently enabling collection', () => {
  const target = storage();
  setSkyPhoenixEnabled(target, true, now);
  appendSkyPhoenixEvent(target, event(1), now);
  setSkyPhoenixEnabled(target, false, now);
  const cleared = clearSkyPhoenixHistory(target);
  assert.equal(cleared.enabled, false);
  assert.deepEqual(cleared.events, []);
});
