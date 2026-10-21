import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';
import { rockstarAccountStore } from '../lib/rockstar-account.ts';
import { jenniferPasskeyStore } from '../lib/jennifer-passkey.ts';
import { eveHistoryStore } from '../lib/eve-history.ts';

const at = Date.now();
const origin = 'https://avoado.si';
const request = (cookie = '', extra = {}) =>
  new Request(origin + '/api/os/access', {
    method: 'POST',
    headers: {
      origin,
      cookie,
      'user-agent': 'account-cryptographic-fixture',
      ...extra,
    },
  });
const sessionRequest = (value) => request(value.cookie.split(';')[0]);
const bindingRequest = (options) => request(options.cookie.split(';')[0]);
const sha = (value) => createHash('sha256').update(value).digest();
const b64 = (value) => Buffer.from(value).toString('base64url');
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const legacy = existsSync(
    new URL('../drizzle/0077_jennifer_passkey_base.sql', import.meta.url),
  )
    ? '0077_jennifer_passkey_base.sql'
    : '0023_jennifer_schema_guard.sql';
  const historyMigration = existsSync(new URL('../drizzle/0070_eve_durable_history.sql', import.meta.url)) ? '0070_eve_durable_history.sql' : '0026_eve_account_sync.sql';
  const accountMigration = existsSync(new URL('../drizzle/0078_rockstar_accounts.sql', import.meta.url)) ? '0078_rockstar_accounts.sql' : '0028_rockstar_accounts.sql';
  for (const file of [historyMigration, legacy, accountMigration]) {
    const sql = readFileSync(
      new URL('../drizzle/' + file, import.meta.url),
      'utf8',
    );
    if (file === legacy) {
      for (const statement of sql.split('--> statement-breakpoint'))
        if (
          /CREATE (?:TABLE|(?:UNIQUE )?INDEX)/.test(statement) &&
          /jennifer_passkey_/.test(statement)
        )
          sqlite.exec(statement);
    } else sqlite.exec(sql);
  }
  sqlite.exec(`CREATE TABLE rockstar_device_sessions(id TEXT PRIMARY KEY,user_id TEXT,revoked_at INTEGER,expires_at INTEGER);
    CREATE TABLE rockstar_device_authorizations(id TEXT PRIMARY KEY,user_id TEXT,status TEXT);`);
  const prepare = (sql, args = []) => ({
    bind(...values) {
      return prepare(sql, values);
    },
    async first() {
      return sqlite.prepare(sql).get(...args) ?? null;
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...args) };
    },
    async run() {
      return {
        meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
      };
    },
  });
  let queue = Promise.resolve();
  const db = {
    prepare,
    batch(statements) {
      const result = queue.then(async () => {
        sqlite.exec('BEGIN');
        try {
          const rows = [];
          for (const statement of statements) rows.push(await statement.run());
          sqlite.exec('COMMIT');
          return rows;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  return {
    sqlite,
    db,
    account: rockstarAccountStore(db),
    passkeys: jenniferPasskeyStore(db),
  };
}
function authenticator(options, overrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const key = publicKey.export({ format: 'jwk' }),
    id = randomBytes(32),
    counter = Buffer.alloc(4),
    length = Buffer.alloc(2);
  length.writeUInt16BE(id.length);
  const cose = encodeCBOR(
    new Map([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(key.x, 'base64url')],
      [-3, Buffer.from(key.y, 'base64url')],
    ]),
  );
  const client = Buffer.from(
    JSON.stringify({
      type: 'webauthn.create',
      challenge: options.publicKey.challenge,
      origin,
      crossOrigin: false,
      ...overrides,
    }),
  );
  const data = Buffer.concat([
    sha('avoado.si'),
    Buffer.from([0x45]),
    counter,
    Buffer.alloc(16),
    length,
    id,
    Buffer.from(cose),
  ]);
  return {
    privateKey,
    id: b64(id),
    handle: options.publicKey.user.id,
    credential: {
      id: b64(id),
      rawId: b64(id),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(client),
        attestationObject: b64(
          encodeCBOR(
            new Map([
              ['fmt', 'none'],
              ['attStmt', new Map()],
              ['authData', data],
            ]),
          ),
        ),
        transports: ['internal'],
      },
    },
  };
}
function assertion(options, auth, flags = 0x05) {
  const client = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: options.publicKey.challenge,
      origin,
      crossOrigin: false,
    }),
  );
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(1);
  const data = Buffer.concat([sha('avoado.si'), Buffer.from([flags]), counter]);
  return {
    id: auth.id,
    rawId: auth.id,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: b64(client),
      authenticatorData: b64(data),
      signature: b64(
        sign('sha256', Buffer.concat([data, sha(client)]), auth.privateKey),
      ),
      userHandle: auth.handle,
    },
  };
}
async function enroll(
  f,
  mode = 'signup',
  owner = null,
  details = {},
  now = at,
) {
  const options = await f.account.begin(
    request(),
    { mode, ...details },
    owner,
    now,
  );
  const auth = authenticator(options);
  const session = await f.account.finish(
    bindingRequest(options),
    { challengeId: options.challengeId, credential: auth.credential },
    owner,
    now + 1,
  );
  const user = await f.passkeys.authenticateSession(
    sessionRequest(session),
    now + 2,
  );
  return { options, auth, session, user };
}

void test('ChatGPT-free signup and signed login use a server owner; Eve data remain isolated', async (t) => {
  const f = fixture(t),
    a = await enroll(f),
    b = await enroll(f, 'signup', null, { userId: a.user });
  assert.match(a.user, /^rockstar:/);
  assert.notEqual(a.user, b.user);
  assert.match(a.session.cookie, /HttpOnly; SameSite=Strict/);
  assert.match(a.session.cookie, /; Secure$/);
  assert.match(a.session.recoveryCode, /^rock_recovery_/);
  const disk = JSON.stringify(
    f.sqlite.prepare('SELECT * FROM rockstar_accounts').all(),
  );
  assert.ok(!disk.includes(a.session.recoveryCode));
  const history = (owner) =>
    eveHistoryStore(
      f.db,
      owner,
      { current: 'fixture', keys: { fixture: 'ab'.repeat(32) } },
      true,
    );
  const id = crypto.randomUUID();
  await history(a.user).save({
    session: {
      version: 1,
      id,
      toolId: 'sky-auto',
      createdAt: at,
      messages: [
        { id: 'original', side: 'me', text: 'account isolation fixture' },
      ],
      activeRequest: null,
      workflowStatus: 'ready',
      outcome: null,
    },
    revision: 0,
    remember: true,
  });
  await assert.rejects(history(b.user).get(id), (e) => e.status === 404);
  const options = await f.account.begin(
    request(),
    { mode: 'login' },
    null,
    at + 10,
  );
  const session = await f.account.finish(
    bindingRequest(options),
    {
      challengeId: options.challengeId,
      credential: assertion(options, a.auth),
    },
    null,
    at + 11,
  );
  const owner = await f.passkeys.authenticateSession(
    sessionRequest(session),
    at + 12,
  );
  assert.equal(owner, a.user);
  assert.equal(
    (await history(owner).get(id)).session.messages[0].text,
    'account isolation fixture',
  );
});
void test('credential addition preserves old keys, sessions, owner data and Pixel grants', async (t) => {
  const f = fixture(t),
    a = await enroll(f);
  f.sqlite
    .prepare('INSERT INTO rockstar_device_sessions VALUES(?,?,NULL,?)')
    .run('pixel', a.user, at + 90000);
  const b = await enroll(f, 'add', a.user);
  assert.equal(b.user, a.user);
  assert.equal(b.session.recoveryCode, null);
  assert.equal((await f.account.listCredentials(a.user)).length, 2);
  assert.equal(
    await f.passkeys.authenticateSession(sessionRequest(a.session), at + 3),
    a.user,
  );
  assert.equal(
    f.sqlite.prepare('SELECT revoked_at FROM rockstar_device_sessions').get()
      .revoked_at,
    null,
  );
  await f.passkeys.requireRecentSession(
    sessionRequest(b.session),
    a.user,
    at + 4,
  );
  await f.account.revokeCredential(request(), a.user, a.auth.id, at + 5);
  await assert.rejects(
    f.passkeys.authenticateSession(sessionRequest(a.session), at + 6),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    f.account.revokeCredential(request(), a.user, b.auth.id, at + 6),
    /CREDENTIAL_NOT_REMOVABLE/,
  );
});
void test('enrollment rejects missing browser proof, wrong owner, cross origin, expiry and replay', async (t) => {
  const f = fixture(t),
    a = await enroll(f),
    options = await f.account.begin(
      request(),
      { mode: 'add' },
      a.user,
      at + 20,
    ),
    auth = authenticator(options),
    body = { challengeId: options.challengeId, credential: auth.credential };
  await assert.rejects(
    f.account.finish(request(), body, a.user, at + 21),
    /CHALLENGE/,
  );
  await assert.rejects(
    f.account.finish(bindingRequest(options), body, 'other-owner', at + 21),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    f.account.finish(
      request(options.cookie, { origin: 'https://evil.invalid' }),
      body,
      a.user,
      at + 21,
    ),
    /ORIGIN/,
  );
  await assert.rejects(
    f.account.finish(bindingRequest(options), body, a.user, at + 300021),
    /CHALLENGE/,
  );
  await f.account.finish(bindingRequest(options), body, a.user, at + 22);
  await assert.rejects(
    f.account.finish(bindingRequest(options), body, a.user, at + 23),
    /CHALLENGE/,
  );
});
void test('recovery rotates the secret, revokes old credentials and device grants, fences stale additions', async (t) => {
  const f = fixture(t),
    a = await enroll(f);
  f.sqlite
    .prepare('INSERT INTO rockstar_device_sessions VALUES(?,?,NULL,?)')
    .run('pixel', a.user, at + 90000);
  f.sqlite
    .prepare('INSERT INTO rockstar_device_authorizations VALUES(?,?,?)')
    .run('approved-code', a.user, 'approved');
  const stale = await f.account.begin(
      request(),
      { mode: 'add' },
      a.user,
      at + 2,
    ),
    staleAuth = authenticator(stale);
  const recovered = await enroll(
    f,
    'recover',
    null,
    { recoveryCode: a.session.recoveryCode, confirmRevoke: true },
    at + 3,
  );
  assert.equal(recovered.user, a.user);
  assert.notEqual(recovered.session.recoveryCode, a.session.recoveryCode);
  await assert.rejects(
    f.passkeys.authenticateSession(sessionRequest(a.session), at + 6),
    /UNAUTHORIZED/,
  );
  assert.ok(
    f.sqlite.prepare('SELECT revoked_at FROM rockstar_device_sessions').get()
      .revoked_at,
  );
  assert.equal(
    f.sqlite.prepare('SELECT status FROM rockstar_device_authorizations').get()
      .status,
    'denied',
  );
  await assert.rejects(
    f.account.begin(
      request(),
      {
        mode: 'recover',
        recoveryCode: a.session.recoveryCode,
        confirmRevoke: true,
      },
      null,
      at + 7,
    ),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    f.account.finish(
      bindingRequest(stale),
      { challengeId: stale.challengeId, credential: staleAuth.credential },
      a.user,
      at + 8,
    ),
    /CHALLENGE/,
  );
  assert.equal((await f.account.listCredentials(a.user)).length, 1);
});
void test('concurrent recoveries have one winner and cannot create a second surviving key', async (t) => {
  const f = fixture(t),
    a = await enroll(f),
    inputs = {
      mode: 'recover',
      recoveryCode: a.session.recoveryCode,
      confirmRevoke: true,
    };
  const x = await f.account.begin(request(), inputs, null, at + 2),
    y = await f.account.begin(request(), inputs, null, at + 2);
  const outcomes = await Promise.allSettled(
    [x, y].map((options) =>
      f.account.finish(
        bindingRequest(options),
        {
          challengeId: options.challengeId,
          credential: authenticator(options).credential,
        },
        null,
        at + 3,
      ),
    ),
  );
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal((await f.account.listCredentials(a.user)).length, 1);
});
void test('concurrent signup completions consume one flow and never create two accounts or keys', async (t) => {
  const f = fixture(t),
    options = await f.account.begin(request(), { mode: 'signup' }, null, at);
  const outcomes = await Promise.allSettled(
    [authenticator(options), authenticator(options)].map((auth) =>
      f.account.finish(
        bindingRequest(options),
        { challengeId: options.challengeId, credential: auth.credential },
        null,
        at + 1,
      ),
    ),
  );
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  for (const table of [
    'rockstar_accounts',
    'jennifer_passkey_credentials',
    'jennifer_passkey_sessions',
  ])
    assert.equal(
      f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,
      1,
    );
});
void test('invalid signatures, RP origin and absent user verification never create sessions', async (t) => {
  const f = fixture(t),
    options = await f.account.begin(request(), { mode: 'signup' }, null, at),
    auth = authenticator(options, { origin: 'https://evil.invalid' });
  await assert.rejects(
    f.account.finish(
      bindingRequest(options),
      { challengeId: options.challengeId, credential: auth.credential },
      null,
      at + 1,
    ),
  );
  assert.equal(
    f.sqlite
      .prepare('SELECT count(*) AS n FROM jennifer_passkey_sessions')
      .get().n,
    0,
  );
  const a = await enroll(f),
    login = await f.account.begin(request(), { mode: 'login' }, null, at + 4);
  await assert.rejects(
    f.account.finish(
      bindingRequest(login),
      {
        challengeId: login.challengeId,
        credential: assertion(login, a.auth, 1),
      },
      null,
      at + 5,
    ),
  );
  const forged = assertion(login, a.auth),
    signature = Buffer.from(forged.response.signature, 'base64url');
  signature[signature.length - 1] ^= 1;
  forged.response.signature = b64(signature);
  await assert.rejects(
    f.account.finish(
      bindingRequest(login),
      { challengeId: login.challengeId, credential: forged },
      null,
      at + 6,
    ),
  );
});
void test('logout and recent-auth requirements are enforced by the server', async (t) => {
  const f = fixture(t),
    a = await enroll(f);
  await assert.rejects(
    f.passkeys.requireRecentSession(
      sessionRequest(a.session),
      a.user,
      at + 301000,
    ),
    /REAUTH/,
  );
  await f.passkeys.revokeSession(sessionRequest(a.session), at + 3);
  await assert.rejects(
    f.passkeys.authenticateSession(sessionRequest(a.session), at + 4),
    /UNAUTHORIZED/,
  );
});
void test('failed recovery attempts are atomically rate limited without storing raw secrets', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 20; i++)
    await assert.rejects(
      f.account.begin(
        request(),
        { mode: 'recover', recoveryCode: 'bad', confirmRevoke: true },
        null,
        at,
      ),
      /UNAUTHORIZED/,
    );
  await assert.rejects(
    f.account.begin(
      request(),
      { mode: 'recover', recoveryCode: 'bad', confirmRevoke: true },
      null,
      at,
    ),
    /RATE_LIMITED/,
  );
  assert.equal(
    f.sqlite.prepare('SELECT count(*) AS n FROM rockstar_accounts').get().n,
    0,
  );
});
