// Software authenticators for a disposable, loopback-only Worker/D1 acceptance.
// This does not attest a real biometric authenticator or authorize live signup.
import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  randomUUID,
} from 'node:crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3037');
assert.ok(
  base.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(base.hostname),
  'Only a disposable loopback preview is allowed',
);
const b64 = (x) => Buffer.from(x).toString('base64url');
const sha = (x) => createHash('sha256').update(x).digest();
let assertions = 0;
function check(condition, name) {
  assertions++;
  assert.ok(condition, name);
}
class Browser {
  cookies = new Map();
  async call(method, path, body, extra = {}) {
    const response = await fetch(new URL(path, base), {
      method,
      headers: {
        Origin: base.origin,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
    });
    for (const value of response.headers.getSetCookie()) {
      const first = value.split(';')[0],
        i = first.indexOf('=');
      if (/Max-Age=0(?:;|$)/i.test(value))
        this.cookies.delete(first.slice(0, i));
      else this.cookies.set(first.slice(0, i), first.slice(i + 1));
    }
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  }
}
function credential(options) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    }),
    jwk = publicKey.export({ format: 'jwk' }),
    id = randomBytes(32);
  const cose = encodeCBOR(
    new Map([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')],
    ]),
  );
  const length = Buffer.alloc(2);
  length.writeUInt16BE(id.length);
  const data = Buffer.concat([
    sha(options.publicKey.rp.id),
    Buffer.from([0x45]),
    Buffer.alloc(4),
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
        clientDataJSON: b64(
          JSON.stringify({
            type: 'webauthn.create',
            challenge: options.publicKey.challenge,
            origin: base.origin,
            crossOrigin: false,
          }),
        ),
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
function assertion(options, auth) {
  const client = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: options.publicKey.challenge,
      origin: base.origin,
      crossOrigin: false,
    }),
  );
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(1);
  const data = Buffer.concat([
    sha(options.publicKey.rpId),
    Buffer.from([5]),
    counter,
  ]);
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
async function enroll(browser, mode = 'signup', details = {}) {
  const start = await browser.call('POST', '/api/os/access', {
    action: 'options',
    mode,
    ...details,
  });
  check(start.status === 200, mode + ' options');
  const auth = credential(start.body),
    finish = await browser.call('POST', '/api/os/access', {
      action: 'verify',
      challengeId: start.body.challengeId,
      credential: auth.credential,
    });
  check(finish.status === 200, mode + ' verified');
  check(
    finish.headers.get('cache-control').includes('no-store'),
    'auth response not cached',
  );
  return { auth, recoveryCode: finish.body.recoveryCode };
}
const a = new Browser(),
  b = new Browser();
const guest = await a.call('GET', '/api/os/access');
check(
  guest.status === 200 && guest.body.signedIn === false,
  'anonymous without ChatGPT',
);
const first = await enroll(a),
  status = await a.call('GET', '/api/os/access');
check(
  status.body.signedIn && status.body.method === 'passkey',
  'independent passkey identity',
);
const scope = status.body.storageScope,
  thread = randomUUID();
const save = await a.call('PUT', '/api/eve/history', {
  session: {
    version: 1,
    id: thread,
    toolId: 'sky-auto',
    createdAt: Date.now(),
    messages: [
      { id: 'fixture', side: 'me', text: '[合成API試験] account continuation' },
    ],
    activeRequest: null,
    workflowStatus: 'ready',
    outcome: null,
  },
  revision: 0,
  remember: true,
});
check(save.status === 200, 'Eve encrypted history saved');
const oldSession = new Browser();
oldSession.cookies = new Map(a.cookies);
await enroll(a, 'add');
check(
  (await a.call('GET', '/api/os/access')).body.credentials.length === 2,
  'second key preserves first',
);
check(
  (await oldSession.call('GET', '/api/os/access')).body.signedIn,
  'original session preserved',
);
await enroll(b);
const other = await b.call('GET', '/api/eve/history?id=' + thread);
check(other.status === 404, 'other account cannot read conversation');
const recovered = new Browser(),
  recovery = await enroll(recovered, 'recover', {
    recoveryCode: first.recoveryCode,
    confirmRevoke: true,
  });
check(recovery.recoveryCode !== first.recoveryCode, 'one-use recovery rotated');
check(
  (await recovered.call('GET', '/api/os/access')).body.storageScope === scope,
  'same owner after recovery',
);
check(
  (await oldSession.call('GET', '/api/eve/history?id=' + thread)).status ===
    401,
  'old session revoked',
);
check(
  (
    await recovered.call('GET', '/api/eve/history?id=' + thread)
  ).body.session.messages[0].text.includes('合成API試験'),
  'history preserved',
);
const login = new Browser(),
  start = await login.call('POST', '/api/os/access', {
    action: 'options',
    mode: 'login',
  });
check(start.status === 200, 'signed login options');
const payload = {
  action: 'verify',
  challengeId: start.body.challengeId,
  credential: assertion(start.body, recovery.auth),
};
check(
  (await login.call('POST', '/api/os/access', payload)).status === 200,
  'signed login',
);
check(
  (await login.call('GET', '/api/os/access')).body.storageScope === scope,
  'same owner after login',
);
check(
  (await login.call('POST', '/api/os/access', payload)).status === 400,
  'replay rejected',
);
const cross = await login.call(
  'POST',
  '/api/os/access',
  { action: 'options', mode: 'login' },
  { Origin: 'https://evil.invalid' },
);
check(cross.status === 403, 'cross-origin mutation rejected');
const spoiled = new Browser();
spoiled.cookies.set('jennifer_access', 'jennifer_session_' + 'a'.repeat(43));
check(
  (
    await spoiled.call('GET', '/api/os/access', null, {
      'oai-authenticated-user-id': 'fixture-other-owner',
    })
  ).body.signedIn === false,
  'invalid independent session cannot fall through to gateway',
);
check((await login.call('DELETE', '/api/os/access')).status === 200, 'logout');
check(
  (await login.call('GET', '/api/eve/history?id=' + thread)).status === 401,
  'logout removes private access',
);
const item = await recovered.call('GET', '/api/eve/history?id=' + thread);
check(
  (
    await recovered.call('DELETE', '/api/eve/history', {
      id: thread,
      revision: item.body.revision,
      confirm: 'delete-history',
    })
  ).status === 200,
  'synthetic thread removed',
);
console.log(
  `Account Worker/D1: ${assertions} assertions passed; software authenticators, loopback-only synthetic users; no live account or device grant.`,
);
