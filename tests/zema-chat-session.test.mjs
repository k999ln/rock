import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readZemaChatSessions,
  saveZemaChatSession,
  ZEMA_CHAT_SESSION_KEY,
  ZEMA_CHAT_SESSION_TTL_MS,
} from '../lib/zema-chat-session.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const id = 'b55ad88a-5b84-4ac2-ac0d-c5441c832be1';

void test('a Sky handoff creates a separate Zema chat that survives reload in the same tab', () => {
  const storage = memoryStorage();
  const session = {
    version: 1,
    id,
    toolId: 'mr-citations',
    createdAt: 1_000,
    messages: [
      { id: 'user-1', side: 'me', text: '出典を整理して', tool: 'mr-citations' },
      { id: 'sky-1', side: 'sky', text: '入力を確認しています。', tool: 'mr-citations' },
    ],
    activeRequest: { id: 'run-1', text: '出典を整理して', toolId: 'mr-citations' },
    workflowStatus: 'ready',
    outcome: null,
  };
  saveZemaChatSession(session, storage, 1_001);
  assert.deepEqual(readZemaChatSessions(storage, 1_002), [session]);
  const completed = {
    ...session,
    workflowStatus: 'completed',
    outcome: { ok: true, text: '整理済みの本文' },
  };
  saveZemaChatSession(completed, storage, 1_003);
  assert.deepEqual(readZemaChatSessions(storage, 1_004), [completed]);
});

void test('private chat text expires after ten minutes even after later updates', () => {
  const storage = memoryStorage();
  saveZemaChatSession({
    version: 1,
    id,
    toolId: 'mr-citations',
    createdAt: 1_000,
    messages: [{ id: 'u', side: 'me', text: 'private request' }],
    activeRequest: null,
    workflowStatus: 'ready',
    outcome: null,
  }, storage, 1_000 + ZEMA_CHAT_SESSION_TTL_MS - 1);
  assert.deepEqual(
    readZemaChatSessions(storage, 1_000 + ZEMA_CHAT_SESSION_TTL_MS + 1),
    [],
  );
  assert.equal(storage.getItem(ZEMA_CHAT_SESSION_KEY), '[]');
});

void test('malformed or oversized saved state is rejected', () => {
  const storage = memoryStorage();
  storage.setItem(ZEMA_CHAT_SESSION_KEY, '{broken');
  assert.deepEqual(readZemaChatSessions(storage, 1_000), []);
  assert.equal(storage.getItem(ZEMA_CHAT_SESSION_KEY), null);
  storage.setItem(ZEMA_CHAT_SESSION_KEY, 'x'.repeat(1_000_001));
  assert.deepEqual(readZemaChatSessions(storage, 1_000), []);
});
