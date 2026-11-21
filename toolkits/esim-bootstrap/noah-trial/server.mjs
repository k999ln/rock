import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { NoahTrial, newCredential, TRIAL_MS, TrialError } from './trial.mjs';
import { base, esc, layout, screen } from './view.mjs';

async function readForm(req) {
  if (
    req.headers['content-type']?.split(';')[0] !==
    'application/x-www-form-urlencoded'
  )
    throw new TrialError(415, 'フォームから送信してください。');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 2048) throw new TrialError(413, '入力が長すぎます。');
    chunks.push(chunk);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if (new Set(form.keys()).size !== [...form.keys()].length)
    throw new TrialError(400, '入力が重複しています。');
  return Object.fromEntries(form);
}
function listen(server, port) {
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', fail);
      ok();
    });
  });
}
const closeServer = (server) =>
  new Promise((resolve) => {
    server.close(resolve);
    server.closeIdleConnections();
  });
// Only an opaque, authenticated envelope enters the browser. Restarting the host
// rotates its key; the same local invite recovers the account and its work.
function sealSession(key, token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
}
function openSession(key, envelope) {
  if (typeof envelope !== 'string' || !/^[a-zA-Z0-9_-]{95}$/.test(envelope))
    return null;
  try {
    const bytes = Buffer.from(envelope, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
export async function startTrialServers(
  trial,
  { publicPort = 0, mobilePort = 0 } = {},
) {
  const origins = {};
  const sessionKey = randomBytes(32);
  let cookie;
  const cookieOptions = `; Path=${base}; HttpOnly; SameSite=Strict; Secure`;
  const forMember = (act) => async (context) => {
    const member = trial.session(context.token);
    if (!member) throw new TrialError(401, '招待コードで入り直してください。');
    await act(member.owner, context);
  };
  const actions = new Map([
    [
      base + 'login',
      ({ fields, res }) => {
        const token = trial.login(fields.invite ?? '');
        const session = sealSession(sessionKey, token);
        res.setHeader(
          'Set-Cookie',
          cookie + '=' + session + cookieOptions + '; Max-Age=86400',
        );
      },
    ],
    [base + 'enroll', forMember((owner) => trial.enroll(owner))],
    [base + 'install', forMember((owner) => trial.install(owner))],
    [
      base + 'approve',
      forMember((owner, { dedicated, fields }) =>
        trial.approve(owner, dedicated, fields),
      ),
    ],
    [
      base + 'read',
      forMember((owner, { dedicated, fields }) =>
        trial.receive(owner, dedicated, fields.id ?? ''),
      ),
    ],
    [
      base + 'stop',
      forMember(async (owner, { dedicated, fields }) => {
        await trial.gate(owner, dedicated);
        await trial.stop(owner, fields.id ?? '');
      }),
    ],
    [base + 'revoke', forMember((owner) => trial.revoke(owner))],
    [
      base + 'logout',
      forMember((_owner, { token, res }) => {
        trial.logout(token);
        res.setHeader(
          'Set-Cookie',
          cookie + '=' + cookieOptions + '; Max-Age=0',
        );
      }),
    ],
  ]);
  function handler(dedicated) {
    return async (req, res) => {
      const origin = dedicated ? origins.mobile : origins.public;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      try {
        if (!origin || req.headers.host !== new URL(origin).host)
          throw new TrialError(403, 'ローカルの入口から開いてください。');
        const path = req.url;
        if (path === '/' && req.method === 'GET') {
          res.writeHead(302, { Location: base });
          res.end();
          return;
        }
        const envelope = (req.headers.cookie ?? '')
          .split(';')
          .map((v) => v.trim())
          .find((v) => v.startsWith(cookie + '='))
          ?.slice(cookie.length + 1);
        const token = openSession(sessionKey, envelope);
        if (req.method === 'GET' && path === base) {
          const session = trial.session(token);
          const order = session && trial.order(session.owner);
          let verified = false;
          if (
            dedicated &&
            order?.state === 'enabled' &&
            trial.phone(session.owner) &&
            order.access === 'active'
          ) {
            await trial.gate(session.owner, true);
            verified = true;
          }
          res.end(
            screen({
              session,
              order,
              dedicated,
              verified,
              origins,
              installed: session && !!trial.phone(session.owner),
              freeLine:
                session &&
                (!order || order.state === 'requested') &&
                (await trial.freeLineAvailable()),
              jobs: verified ? await trial.jobs(session.owner) : [],
              notice:
                !dedicated && session && (await trial.hasUpdate(session.owner)),
            }),
          );
          return;
        }
        const action = actions.get(path);
        if (req.method !== 'POST' || !action)
          throw new TrialError(404, 'ページが見つかりません。');
        if (req.headers.origin !== origin)
          throw new TrialError(403, 'この試験画面から操作してください。');
        const fields = await readForm(req);
        await action({ fields, res, token, dedicated });
        res.writeHead(303, { Location: base });
        res.end();
      } catch (error) {
        res.statusCode = error instanceof TrialError ? error.status : 503;
        res.end(
          layout(
            '操作を確認してください',
            `<p>${esc(error instanceof TrialError ? error.message : '状態を照合できませんでした。同じ試験画面から再試行してください。')}</p><a href="${base}">試験画面へ戻る</a>`,
          ),
        );
      }
    };
  }
  const general = createServer(handler(false)),
    mobile = createServer(handler(true));
  await listen(general, publicPort);
  try {
    await listen(mobile, mobilePort);
  } catch (error) {
    await closeServer(general);
    throw error;
  }
  origins.public = 'http://127.0.0.1:' + general.address().port;
  origins.mobile = 'http://127.0.0.1:' + mobile.address().port;
  cookie = 'noah_trial_' + general.address().port;
  try {
    await trial.recoverAlarms();
  } catch (error) {
    await Promise.all([closeServer(general), closeServer(mobile)]);
    throw error;
  }
  return {
    origins,
    async close() {
      await Promise.all([closeServer(general), closeServer(mobile)]);
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.umask(0o077);
  const dir = join(homedir(), '.local', 'share', 'noah', 'esim-trial');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const trial = new NoahTrial(dir);
  const path = join(dir, 'invite.txt');
  // A stable private file lets another browser recover the same invitation.
  // Starting again never renews an expired invitation or grants a second order.
  if (!trial.db.prepare('SELECT 1 FROM trial_owners LIMIT 1').get()) {
    let credential;
    try {
      credential = readFileSync(path, 'utf8').trim();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      credential = newCredential();
      writeFileSync(path, credential + '\n', { mode: 0o600, flag: 'wx' });
    }
    chmodSync(path, 0o600);
    trial.invite(randomUUID(), credential, Date.now() + TRIAL_MS);
  }
  const servers = await startTrialServers(trial, {
    publicPort: 43871,
    mobilePort: 43872,
  });
  console.log(
    `Noah 模擬回線　${servers.origins.public}${base}\n招待コードはこのMacの ${path} にあります。\n申込・Agent実行・事業者費用 0円。停止は Ctrl+C。`,
  );
  const shutdown = async () => {
    await servers.close();
    await trial.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
