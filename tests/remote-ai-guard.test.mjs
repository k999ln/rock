import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '../lib/remote-ai-guard.ts';

function fakeDb() {
  const rows = new Map();
  return {
    prepare(_sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async run() {
          const [userId, route, windowStartedAt] = args;
          const key = `${userId}:${route}`;
          const previous = rows.get(key);
          rows.set(
            key,
            previous?.windowStartedAt === windowStartedAt
              ? { windowStartedAt, requestCount: previous.requestCount + 1 }
              : { windowStartedAt, requestCount: 1 },
          );
          return { meta: { changes: 1 } };
        },
        async first() {
          const [userId, route] = args;
          return rows.get(`${userId}:${route}`) ?? null;
        },
      };
    },
  };
}

const request = (origin = 'https://rockstaros-kaiya.noellesugar1.chatgpt.site') =>
  new Request(`${origin}/api/llm/text`, {
    method: 'POST',
    headers: {
      origin,
      'oai-authenticated-user-id': 'owner-1',
    },
  });

await test('remote AI guard requires the trusted same-origin user context', async () => {
  await assert.rejects(
    authorizeRemoteAiRequest(
      new Request('https://rockstaros-kaiya.noellesugar1.chatgpt.site/api/llm/text', {
        method: 'POST',
        headers: {
          origin: 'https://rockstaros-kaiya.noellesugar1.chatgpt.site',
        },
      }),
      'llm-text',
      fakeDb(),
    ),
    (error) => error instanceof RemoteAiGuardError && error.status === 401,
  );
  await assert.rejects(
    authorizeRemoteAiRequest(
      new Request(
        'https://rockstaros-kaiya.noellesugar1.chatgpt.site/api/llm/text',
        {
          method: 'POST',
          headers: {
            origin: 'https://attacker.invalid',
            'oai-authenticated-user-id': 'owner-1',
          },
        },
      ),
      'llm-text',
      fakeDb(),
    ),
    (error) => error instanceof RemoteAiGuardError && error.status === 403,
  );
});

await test('remote AI guard stops the 21st request in one minute', async () => {
  const db = fakeDb();
  for (let index = 0; index < 20; index += 1)
    await authorizeRemoteAiRequest(request(), 'llm-text', db);
  await assert.rejects(
    authorizeRemoteAiRequest(request(), 'llm-text', db),
    (error) => error instanceof RemoteAiGuardError && error.status === 429,
  );
});
