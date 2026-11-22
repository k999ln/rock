import { createServer } from 'node:http';
import { routeId } from '../../../services/noah-test-runtime/src/esim-trial/cloud-packages.mjs';
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
import {
  registerAddress,
  recipientAddress,
} from '../../../services/operator-dock/src/distribution-address.ts';
import { lineEligibility } from '../../../services/operator-dock/src/distribution-api.ts';
import { runPlans } from '../../../services/operator-dock/src/distribution-plans.ts';
import { deliverNotices } from '../../../services/operator-dock/src/distribution-notices.ts';
import { trialDock } from './dock.mjs';
import { OperatorError } from '../../../services/operator-dock/src/validation.ts';
import {
  recipientAssignments,
  recipientHasPending,
  receiveAssignment,
} from '../../../services/operator-dock/src/distribution.ts';
import {
  base,
  esc,
  layout,
  screen,
  cloudScreen,
  addressScreen,
} from './view.mjs';

async function readForm(req, maxBytes) {
  if (
    req.headers['content-type']?.split(';')[0] !==
    'application/x-www-form-urlencoded'
  )
    throw new TrialError(415, 'フォームから送信してください。');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw new TrialError(413, '入力が長すぎます。');
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
  {
    publicPort = 0,
    mobilePort = 0,
    dockPort = 0,
    dockPassword = newCredential(),
    handsetSlot = 1,
  } = {},
) {
  const origins = {};
  const sessionKey = trial.sessionKey(handsetSlot);
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
    [base + 'install', forMember((owner) => trial.install(owner, handsetSlot))],
    [
      base + 'address',
      forMember(async (owner, { dedicated, fields }) => {
        await trial.gate(owner, dedicated);
        await registerAddress(
          await trial.runtime.distributionDb(),
          owner,
          fields,
        );
      }),
    ],
    [
      base + 'receive',
      forMember(async (owner, { dedicated, fields }) => {
        await trial.gate(owner, dedicated);
        if (Object.keys(fields).length !== 1)
          throw new TrialError(400, '指定された定期便を確認してください。');
        await receiveAssignment(
          await trial.runtime.distributionDb(),
          owner,
          fields.id,
        );
      }),
    ],
    [
      base + 'agents/start',
      forMember((owner, { dedicated, fields }) =>
        trial.cloudWork(owner, dedicated, 'start', fields),
      ),
    ],
    [
      base + 'agents/stop',
      forMember((owner, { dedicated, fields }) =>
        trial.cloudWork(owner, dedicated, 'stop', fields),
      ),
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
        const cookies = (req.headers.cookie ?? '')
          .split(';')
          .map((v) => v.trim());
        const cookieValue = (name) =>
          cookies.find((v) => v.startsWith(name + '='))?.slice(name.length + 1);
        const token = openSession(sessionKey, cookieValue(cookie));
        const selectionKey = cookie + '_selected';
        const selection = cookieValue(selectionKey);
        const clearSelection = () =>
          res.setHeader(
            'Set-Cookie',
            selectionKey + '=' + cookieOptions + '; Max-Age=0',
          );
        const accountHere = trial.session(token);
        const handset = accountHere && trial.phone(accountHere.owner);
        if (dedicated && handset && handset.slot !== handsetSlot)
          throw new TrialError(403, 'この端末の回線を確認できませんでした。');
        if (req.method === 'GET' && path === base + 'address') {
          const member = trial.session(token);
          if (!member)
            throw new TrialError(401, '招待コードで入り直してください。');
          await trial.gate(member.owner, dedicated);
          res.end(
            addressScreen(
              await recipientAddress(
                await trial.runtime.distributionDb(),
                member.owner,
              ),
            ),
          );
          return;
        }
        if (req.method === 'GET' && path.split('?')[0] === base + 'agents') {
          const account = trial.session(token);
          const params = new URL(path, origin).searchParams;
          const agent = params.get('agent') ?? undefined,
            work = params.get('work') ?? undefined;
          if (
            routeId(agent) &&
            !work &&
            (!account || !dedicated || !trial.phone(account.owner))
          ) {
            res.setHeader(
              'Set-Cookie',
              selectionKey + '=' + agent + cookieOptions + '; Max-Age=900',
            );
            res.writeHead(303, { Location: base });
            res.end();
            return;
          }
          if (!account)
            throw new TrialError(401, '招待コードで入り直してください。');
          const state = await trial.cloudWork(
            account.owner,
            dedicated,
            'list',
            { agent, work },
          );
          if (selection) clearSelection();
          res.end(cloudScreen(state, randomUUID()));
          return;
        }
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
            if (routeId(selection)) {
              clearSelection();
              res.writeHead(303, {
                Location:
                  base + 'agents?agent=' + encodeURIComponent(selection),
              });
              res.end();
              return;
            }
          }
          res.end(
            screen({
              session,
              order,
              dedicated,
              verified,
              selectedAgent: routeId(selection) ? selection : undefined,
              origins,
              installed: session && !!trial.phone(session.owner),
              freeLine:
                session &&
                (!order || order.state === 'requested') &&
                (await trial.freeLineAvailable()),
              registered:
                verified &&
                !!(await recipientAddress(
                  await trial.runtime.distributionDb(),
                  session.owner,
                )),
              assignments: verified
                ? await recipientAssignments(
                    await trial.runtime.distributionDb(),
                    session.owner,
                  )
                : [],
              notice:
                !dedicated &&
                session &&
                order?.access === 'active' &&
                (await trial.runtimePermit(session.owner)).active &&
                (await recipientHasPending(
                  await trial.runtime.distributionDb(),
                  session.owner,
                )),
            }),
          );
          return;
        }
        const action = actions.get(path);
        if (req.method !== 'POST' || !action)
          throw new TrialError(404, 'ページが見つかりません。');
        if (req.headers.origin !== origin)
          throw new TrialError(403, 'この試験画面から操作してください。');
        const fields = await readForm(
          req,
          path === base + 'address' ? 8192 : 2048,
        );
        await action({ fields, res, token, dedicated });
        if (
          selection &&
          (path === base + 'logout' || path === base + 'revoke')
        ) {
          const already = res.getHeader('Set-Cookie');
          res.setHeader('Set-Cookie', [
            ...(already ? [String(already)] : []),
            selectionKey + '=' + cookieOptions + '; Max-Age=0',
          ]);
        }
        res.writeHead(303, {
          Location: path.startsWith(base + 'agents/')
            ? base +
              'agents' +
              (fields.agent ? '?agent=' + encodeURIComponent(fields.agent) : '')
            : base,
        });
        res.end();
      } catch (error) {
        res.statusCode =
          error instanceof TrialError || error instanceof OperatorError
            ? error.status
            : 503;
        res.end(
          layout(
            '操作を確認してください',
            `<p>${esc(error instanceof TrialError || error instanceof OperatorError ? error.message : '状態を照合できませんでした。同じ試験画面から再試行してください。')}</p><a href="${base}">試験画面へ戻る</a>`,
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
  const dock = createServer(trialDock(trial, dockPassword));
  try {
    await listen(dock, dockPort);
  } catch (error) {
    await Promise.all([closeServer(general), closeServer(mobile)]);
    throw error;
  }
  origins.dock = 'http://127.0.0.1:' + dock.address().port;
  origins.public = 'http://127.0.0.1:' + general.address().port;
  origins.mobile = 'http://127.0.0.1:' + mobile.address().port;
  cookie = 'noah_trial_' + general.address().port;
  try {
    await trial.recoverAlarms();
  } catch (error) {
    await Promise.all([
      closeServer(general),
      closeServer(mobile),
      closeServer(dock),
    ]);
    throw error;
  }
  let processing;
  const tick = () => {
    if (!processing)
      processing = (async () => {
        const db = await trial.runtime.distributionDb();
        const agent = await trial.runtime.runtime.getWorker(
          'noah-distribution-agent',
        );
        await runPlans(db, lineEligibility(agent), trial.now());
        await deliverNotices(db, agent);
      })()
        .catch(() => {
          /* Durable pending rows are retried on the next tick. */
        })
        .finally(() => {
          processing = undefined;
        });
  };
  tick();
  const timer = setInterval(tick, 300);
  timer.unref();
  return {
    origins,
    async close() {
      clearInterval(timer);
      await processing;
      await Promise.all([
        closeServer(general),
        closeServer(mobile),
        closeServer(dock),
      ]);
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
  const dockKeyPath = join(dir, 'dock-password.txt');
  try {
    writeFileSync(dockKeyPath, newCredential(), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const dockPassword = readFileSync(dockKeyPath, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(dockPassword))
    throw new Error('Dockの認証ファイルを確認してください。');
  const servers = await startTrialServers(trial, {
    dockPassword,
    dockPort: 43873,
    publicPort: 43871,
    mobilePort: 43872,
  });
  console.log(
    `Noah 模擬回線　${servers.origins.public}${base}\n招待コードはこのMacの ${path} にあります。\n申込・Agent実行・事業者費用 0円。停止は Ctrl+C。`,
  );
  console.log(
    '模擬運営Dock ' +
      servers.origins.dock +
      ' ／ operator ／ パスワードは ' +
      dockKeyPath,
  );
  console.log(
    '試験用受取人ID',
    trial.db
      .prepare('SELECT owner FROM trial_owners WHERE expires>?')
      .all(trial.now())
      .map((row) => row.owner)
      .join(', '),
  );
  const shutdown = async () => {
    await servers.close();
    await trial.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
