import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  a2aAgentDirectory,
  discoverA2AAgent,
  parseStoredA2AAgent,
} from '../lib/a2a-agent-directory.ts';

const origin = 'https://agent.example.org';
const card = {
  name: 'Research Agent',
  description: 'Collects public sources.',
  version: '1.2.0',
  supportedInterfaces: [
    { url: `${origin}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
  ],
  capabilities: { streaming: false, pushNotifications: false },
  skills: [{ id: 'research', name: 'Research', description: 'Research a topic.' }],
};

const migrationFiles = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
  .sort();

function makeDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of migrationFiles)
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
            async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
          };
        },
      };
    },
  };
}

void test('discovery fetches only the owner-approved public HTTPS origin and hashes a bounded card snapshot', async () => {
  const requests = [];
  const found = await discoverA2AAgent(origin, async (input, init = {}) => {
    requests.push({ url: new URL(input), init });
    return new Response(JSON.stringify(card), { headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.href, `${origin}/.well-known/agent-card.json`);
  assert.equal(requests[0].init.redirect, 'manual');
  assert.equal(found.origin, origin);
  assert.equal(found.card.name, card.name);
  assert.match(found.cardSha256, /^[a-f0-9]{64}$/);
  assert.equal(parseStoredA2AAgent(found.cardJson).name, card.name);
});

void test('discovery rejects internal hosts, redirect targets and cross-origin A2A endpoints', async () => {
  for (const blocked of ['https://localhost', 'https://127.0.0.1', 'https://agent.internal'])
    await assert.rejects(discoverA2AAgent(blocked), { code: 'origin_not_public' });
  await assert.rejects(
    discoverA2AAgent(origin, async (_input, init = {}) => {
      assert.equal(init.redirect, 'manual');
      return new Response(null, { status: 302, headers: { Location: 'https://other.example.org/card' } });
    }),
    { code: 'agent_card_unavailable' },
  );
  await assert.rejects(
    discoverA2AAgent(origin, async () => new Response(JSON.stringify({
      ...card,
      supportedInterfaces: [{ ...card.supportedInterfaces[0], url: 'https://other.example.org/a2a' }],
    }))),
    { code: 'interface_origin_mismatch' },
  );
});

void test('Sky A2A connection cards are owner-scoped, update in place and can be removed', async (t) => {
  const db = makeDb(t);
  const directory = a2aAgentDirectory(db);
  const first = await discoverA2AAgent(origin, async () => new Response(JSON.stringify(card)));
  const saved = await directory.upsert('alice', first);
  assert.equal(saved.agentName, card.name);
  assert.equal((await directory.list('alice')).length, 1);
  assert.equal((await directory.list('bob')).length, 0);
  const changed = await discoverA2AAgent(origin, async () => new Response(JSON.stringify({ ...card, version: '1.3.0' })));
  const updated = await directory.upsert('alice', changed);
  assert.equal(updated.id, saved.id);
  assert.equal(updated.agentVersion, '1.3.0');
  assert.notEqual(updated.cardSha256, saved.cardSha256);
  assert.equal(await directory.remove('bob', saved.id), false);
  assert.equal(await directory.remove('alice', saved.id), true);
  assert.equal((await directory.list('alice')).length, 0);
});
