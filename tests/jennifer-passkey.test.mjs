import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clearJenniferSessionCookie, jenniferPasskeyStore } from '../lib/jennifer-passkey.ts';

class OptionsDatabase {
  constructor(recent = 0) { this.recent = recent; this.inserts = []; }
  prepare(sql) {
    const database = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async run() { if (/INSERT INTO jennifer_passkey_challenges/.test(sql)) database.inserts.push(this.values); return { meta: { changes: 1 } }; },
      async first() {
        if (/request_key_sha256/.test(sql) && /COUNT/.test(sql)) return { count: database.recent };
        if (/consumed_at IS NULL/.test(sql) && /COUNT/.test(sql)) return { count: 0 };
        return null;
      },
      async all() { return { results: [] }; },
    };
  }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

const request = (url = 'https://columbia.avoado.si/api/jennifer/passkeys/register') =>
  new Request(url, { method: 'POST', headers: { origin: new URL(url).origin } });

void test('Jennifer registration options are fixed to the Columbia RP and require user verification', async () => {
  const database = new OptionsDatabase();
  const result = await jenniferPasskeyStore(database).registrationOptions('owner-1', request(), 1000);
  assert.equal(result.publicKey.rp.id, 'columbia.avoado.si');
  assert.equal(result.publicKey.authenticatorSelection?.residentKey, 'required');
  assert.equal(result.publicKey.authenticatorSelection?.userVerification, 'required');
  assert.deepEqual(result.publicKey.pubKeyCredParams.map(({ alg }) => alg), [-7, -257]);
  assert.equal(database.inserts.length, 1);
});

void test('Jennifer authentication rejects preview hosts and rate-limits challenge creation', async () => {
  await assert.rejects(
    jenniferPasskeyStore(new OptionsDatabase()).authenticationOptions(
      request('https://example.chatgpt.site/api/jennifer/passkeys/authenticate'),
      1000,
    ),
    /PASSKEY_HOST_INVALID/,
  );
  await assert.rejects(
    jenniferPasskeyStore(new OptionsDatabase(10)).authenticationOptions(request(), 1000),
    /PASSKEY_RATE_LIMITED/,
  );
});

void test('Jennifer production session uses a host-only secure cookie', () => {
  assert.equal(
    clearJenniferSessionCookie(true),
    '__Host-jennifer_access=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure',
  );
});

void test('Jennifer registration is verified from attestation and never trusts a client SPKI', () => {
  const server = readFileSync(new URL('../lib/jennifer-passkey.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../components/jennifer-access.tsx', import.meta.url), 'utf8');
  assert.match(server, /verifyRegistrationResponse/);
  assert.match(client, /attestationObject/);
  assert.doesNotMatch(server, /publicKeySpki/);
  assert.doesNotMatch(client, /getPublicKey\(/);
});

