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
      {
        id: 'user-1',
        side: 'me',
        text: '出典を整理して',
        tool: 'mr-citations',
      },
      {
        id: 'sky-1',
        side: 'sky',
        text: '入力を確認しています。',
        tool: 'mr-citations',
      },
    ],
    activeRequest: {
      id: 'run-1',
      text: '出典を整理して',
      toolId: 'mr-citations',
    },
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
  saveZemaChatSession(
    {
      version: 1,
      id,
      toolId: 'mr-citations',
      createdAt: 1_000,
      messages: [{ id: 'u', side: 'me', text: 'private request' }],
      activeRequest: null,
      workflowStatus: 'ready',
      outcome: null,
    },
    storage,
    1_000 + ZEMA_CHAT_SESSION_TTL_MS - 1,
  );
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

await test('AMC chat restores the complete 8,000-character brief and rejects overlong replacement without losing it', () => {
  const storage = memoryStorage();
  const request = 'AMCのGoalと意図を保つ。'.padEnd(8_000, '依');
  const session = {
    version: 1,
    id,
    toolId: 'rockstar-amc',
    createdAt: 1_000,
    messages: [
      { id: 'user-amc', side: 'me', text: request, tool: 'rockstar-amc' },
    ],
    activeRequest: {
      id: 'amc-request',
      text: request,
      toolId: 'rockstar-amc',
      executionProvider: 'local-model',
    },
    workflowStatus: 'ready',
    outcome: null,
  };
  saveZemaChatSession(session, storage, 1_001);
  assert.deepEqual(readZemaChatSessions(storage, 1_002), [session]);
  const raw = storage.getItem(ZEMA_CHAT_SESSION_KEY);
  assert.throws(
    () =>
      saveZemaChatSession(
        {
          ...session,
          activeRequest: { ...session.activeRequest, text: request + '外' },
        },
        storage,
        1_003,
      ),
    /8,000/,
  );
  assert.equal(storage.getItem(ZEMA_CHAT_SESSION_KEY), raw);
  assert.deepEqual(
    readZemaChatSessions(storage, 1_000 + ZEMA_CHAT_SESSION_TTL_MS + 1),
    [],
  );
});

await test('AMC longer briefs do not relax other Tools and malformed saved requests are discarded', () => {
  const storage = memoryStorage();
  const generic = {
    version: 1,
    id,
    toolId: 'mr-citations',
    createdAt: 1_000,
    messages: [
      {
        id: 'user-long',
        side: 'me',
        text: 'x'.repeat(8_000),
        tool: 'mr-citations',
      },
    ],
    activeRequest: {
      id: 'citation-request',
      text: 'x'.repeat(8_000),
      toolId: 'mr-citations',
    },
    workflowStatus: 'ready',
    outcome: null,
  };
  saveZemaChatSession(generic, storage, 1_001);
  const restored = readZemaChatSessions(storage, 1_002)[0];
  assert.equal(restored.messages[0].text.length, 4_000);
  assert.equal(restored.activeRequest.text.length, 2_000);
  storage.setItem(
    ZEMA_CHAT_SESSION_KEY,
    JSON.stringify([
      {
        ...generic,
        toolId: 'rockstar-amc',
        messages: [],
        activeRequest: {
          ...generic.activeRequest,
          toolId: 'rockstar-amc',
          text: 'x'.repeat(8_001),
        },
      },
    ]),
  );
  assert.deepEqual(readZemaChatSessions(storage, 1_003), []);
});
