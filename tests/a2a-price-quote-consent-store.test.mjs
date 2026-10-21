import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { A2APriceQuoteConsentStoreError, recordA2APriceQuoteConsent } from '../lib/a2a-price-quote-consent-store.ts';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = {
    prepare(sql) { return { bind(...values) { return {
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async run() {
        const before = sqlite.prepare('SELECT total_changes() AS n').get().n;
        sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(sqlite.prepare('SELECT total_changes() AS n').get().n - before) } };
      },
    }; } }; },
  };
  return { db, sqlite };
}

const base = {
  id: 'event-one', ownerUserId: 'owner-a', quoteRequestId: 'request-one',
  agentConnectionId: 'agent-one', agentOrigin: 'https://agent.example.com',
  agentName: 'Research Agent', agentVersion: '1.2.0', agentCardSha256: 'a'.repeat(64),
  message: 'private prompt text', currency: 'USD', maximumBudgetMinor: 100,
  expiresAt: 1_900_000_000_000, consentedAt: 1_800_000_000_000,
};

void test('records versioned owner-bound consent by prompt digest and makes request IDs single-use', async (t) => {
  const { db, sqlite } = fixture(t);
  assert.deepEqual(await recordA2APriceQuoteConsent(db, base), { recorded: true });
  const stored = sqlite.prepare('SELECT * FROM a2a_price_quote_consent_events').get();
  assert.equal(stored.consent_version, 'a2a-price-quote-prompt-disclosure-v1');
  assert.equal(stored.prompt_sha256.length, 64);
  assert.doesNotMatch(JSON.stringify(stored), /private prompt text/);
  assert.deepEqual(await recordA2APriceQuoteConsent(db, { ...base, id: 'event-replay' }), { recorded: false });
  await assert.rejects(recordA2APriceQuoteConsent(db, { ...base, id: 'event-changed', message: 'changed prompt' }),
    (error) => error instanceof A2APriceQuoteConsentStoreError && error.code === 'QUOTE_REQUEST_ID_CONFLICT');
  assert.throws(() => sqlite.prepare('UPDATE a2a_price_quote_consent_events SET agent_name = ?').run('changed'),
    /A2A_PRICE_QUOTE_CONSENT_IMMUTABLE/);
  assert.throws(() => sqlite.prepare('DELETE FROM a2a_price_quote_consent_events').run(),
    /A2A_PRICE_QUOTE_CONSENT_IMMUTABLE/);
});

void test('same request UUID is scoped per owner and consent binds agent version, cap and expiry', async (t) => {
  const { db, sqlite } = fixture(t);
  await recordA2APriceQuoteConsent(db, base);
  await recordA2APriceQuoteConsent(db, { ...base, id: 'event-owner-b', ownerUserId: 'owner-b' });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM a2a_price_quote_consent_events').get().count, 2);
  assert.throws(() => sqlite.prepare(`INSERT INTO a2a_price_quote_consent_events
    (id,owner_user_id,quote_request_id,agent_connection_id,agent_origin,agent_name,agent_version,
     agent_card_sha256,prompt_sha256,currency,maximum_budget_minor,expires_at,consent_version,consented_at)
    VALUES ('bad','owner-c','request-bad','agent','https://agent.example.com','Agent','1','short','short','usd',0,0,'wrong',0)`).run(),
    /CHECK/);
});
