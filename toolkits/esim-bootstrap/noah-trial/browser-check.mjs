// Run with node --experimental-strip-types. All data belongs to a throwaway pilot.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { NoahTrial, newCredential, TRIAL_MS } from './trial.mjs';
import { startTrialServers } from './server.mjs';
import { base } from './view.mjs';

const tmp = await mkdtemp(join(tmpdir(), 'noah-distribution-browser-'));
const trial = new NoahTrial(tmp),
  password = newCredential(),
  invite = newCredential();
const who = 'qa-browser-recipient';
trial.invite(who, invite, Date.now() + TRIAL_MS);
const server = await startTrialServers(trial, { dockPassword: password });
const { public: ordinary, mobile, dock } = server.origins;
const profile = join(tmp, 'chrome');
await mkdir(profile);
const binary =
  process.env.NOAH_CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const captureDir = process.env.NOAH_TRIAL_CAPTURE_DIR;
if (captureDir) await mkdir(captureDir, { recursive: true });
const browser = spawn(
  binary,
  [
    '--headless',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-default-apps',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const exit = once(browser, 'exit');
const sockets = [];
async function until(read, label) {
  const deadline = Date.now() + 15_000;
  do {
    const value = await read();
    if (value) return value;
    await delay(60);
  } while (Date.now() < deadline);
  throw Error('Timed out: ' + label);
}
async function devtools(url, onEvent = () => {}) {
  const ws = new WebSocket(url);
  await once(ws, 'open');
  sockets.push(ws);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (msg) =>
        msg.error ? reject(Error(msg.error.message)) : resolve(msg.result),
      );
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    } else onEvent(m, send);
  };
  return send;
}
try {
  const [port, browserPath] = await until(async () => {
    try {
      return (
        await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n');
    } catch {
      return null;
    }
  }, 'Chrome start');
  const endpoint = 'http://127.0.0.1:' + port;
  const control = await devtools('ws://127.0.0.1:' + port + browserPath);
  const ctx = async () =>
    (await control('Target.createBrowserContext')).browserContextId;
  const ownerCtx = await ctx(),
    operatorCtx = await ctx();
  async function page(browserContextId, operator = false) {
    const { targetId } = await control('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
    });
    const listing = await (await fetch(endpoint + '/json/list')).json();
    const send = await devtools(
      listing.find((t) => t.id === targetId).webSocketDebuggerUrl,
      (m, cmd) => {
        if (m.method === 'Fetch.requestPaused')
          void cmd('Fetch.continueRequest', { requestId: m.params.requestId });
        if (m.method === 'Fetch.authRequired')
          void cmd('Fetch.continueWithAuth', {
            requestId: m.params.requestId,
            authChallengeResponse: m.params.request.url.startsWith(dock + '/')
              ? {
                  response: 'ProvideCredentials',
                  username: 'operator',
                  password,
                }
              : { response: 'CancelAuth' },
          });
      },
    );
    if (operator) await send('Fetch.enable', { handleAuthRequests: true });
    await send('Page.enable');
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
      });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = (text) =>
      until(
        () =>
          ev('document.body?.innerText.includes(' + JSON.stringify(text) + ')'),
        text,
      );
    const nav = async (url, text) => {
      await send('Page.navigate', { url });
      await wait(text);
    };
    const field = async (sel, value) =>
      ev(
        'document.querySelector(' +
          JSON.stringify(sel) +
          ').value=' +
          JSON.stringify(value),
      );
    const fill = async (form, data) => {
      for (const [k, v] of Object.entries(data))
        await field(form + ' [name="' + k + '"]', v);
    };
    const click = (sel) =>
      ev('document.querySelector(' + JSON.stringify(sel) + ').click()');
    const screenshot = async (name) => {
      if (captureDir) {
        const { data } = await send('Page.captureScreenshot', {
          format: 'png',
        });
        await writeFile(
          join(captureDir, name + '.png'),
          Buffer.from(data, 'base64'),
          { mode: 0o600 },
        );
      }
    };
    const size = async (width) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.equal(
        await ev('document.documentElement.scrollWidth<=innerWidth'),
        true,
      );
    };
    return {
      targetId,
      send,
      ev,
      nav,
      wait,
      fill,
      field,
      click,
      size,
      screenshot,
      close: () => control('Target.closeTarget', { targetId }),
    };
  }
  let recipient = await page(ownerCtx);
  const ops = await page(operatorCtx, true);
  await recipient.nav(ordinary + base, '招待コード');
  await recipient.fill('form', { invite });
  await recipient.click('button');
  await recipient.wait('0円で申し込む');
  await recipient.click('button');
  await recipient.wait('模擬端末に追加する');
  await recipient.click('button');
  await recipient.wait('模擬専用回線でNoahを開く');
  await recipient.nav(mobile + base, '配送先を登録');
  await recipient.click('a[href$="address"]');
  await recipient.wait('配給の配送先');
  await recipient.size(390);
  await recipient.screenshot('distribution-address-form');
  await recipient.fill('form', {
    name: '試験用宛名',
    postal: '0000000',
    prefecture: '東京都',
    city: '架空市',
    street: '試験用建物',
    building: '',
  });
  await recipient.click('form button');
  await recipient.wait('登録済みです');
  await recipient.close();
  const other = await page(ownerCtx);
  await other.nav(
    'data:text/html,<title>Other work</title><label>Notes<input></label>',
    'Notes',
  );
  await ops.nav(dock + '/', '入荷を記録');
  await ops.fill('#lot', {
    supplier: '試験仕入先',
    item: '試験セット',
    units: '10',
    unit: '箱',
    cost_yen: '1200',
    freight_yen: '300',
  });
  await ops.click('#lot button');
  await ops.wait('運営負担 1,500円');
  const lot = await ops.ev(
    'document.querySelector("#allocation select").options[1].value',
  );
  await ops.fill('#allocation', {
    recipient: who,
    lot_id: lot,
    units: '4',
    pickup: '模擬の受け渡し',
  });
  await ops.click('#allocation button');
  await ops.wait('配給を指定しました');
  await other.ev('document.querySelector("input").focus()');
  await other.send('Input.insertText', { text: 'unrelated note' });
  await until(async () => {
    await ops.click('#refresh');
    await delay(100);
    return ops.ev('document.body.innerText.includes("通知完了")');
  }, 'server-only notification');
  assert.equal(
    await other.ev('document.querySelector("input").value'),
    'unrelated note',
  );
  recipient = await page(ownerCtx);
  await recipient.nav(ordinary + base, '更新があります');
  assert.equal(
    await recipient.ev('document.body.innerText.includes("試験セット")'),
    false,
  );
  await recipient.size(390);
  await recipient.screenshot('distribution-ordinary');
  await recipient.nav(mobile + base, '4箱');
  for (const width of [320, 390]) {
    await recipient.size(width);
    await ops.size(width);
  }
  await recipient.click('form[action$="/receive"] button');
  await recipient.wait('受取済み');
  await recipient.screenshot('distribution-received');
  await ops.click('#refresh');
  await ops.wait('在庫 6 ／ 受取待ち 0 ／ 受取済み 4');
  assert.equal(
    await ops.ev('document.body.innerText.includes("試験用建物")'),
    false,
  );
  await ops.click('#assignments button');
  await ops.wait('試験用建物');
  await ops.click('#assignments button');
  await ops.ev(
    'document.querySelector("#lots").scrollIntoView({block:"center"})',
  );
  await ops.screenshot('distribution-stock');
  console.log(
    'PASS Mac Chrome, independent operator and recipient sessions, 320/390px, address required, recipient tab closed before allocation, unrelated typing, generic notice, result, receipt and hidden-by-default shipping address.',
  );
  // Submit identical text through three different bindings using the real form.
  for (const route of ['noah', 'provider', 'registered']) {
    await recipient.nav(mobile + base + 'agents', '文章の文字数');
    await recipient.fill('form', { route, text: 'abc' });
    await recipient.click('form button');
    const label = {
      noah: 'Noahクラウド',
      provider: '提供元の専用クラウド',
      registered: '登録済みの接続先',
    }[route];
    await until(
      () =>
        recipient.ev(
          'document.querySelector("li")?.textContent.includes(' +
            JSON.stringify(label) +
            ')',
        ),
      'submitted ' + route,
    );
    await recipient.close();
    recipient = await page(ownerCtx);
    await until(async () => {
      await recipient.nav(mobile + base + 'agents', '仕事と成果');
      return recipient.ev(
        'document.querySelector("li")?.textContent.includes("文字数 3") && document.querySelector("li")?.textContent.includes(' +
          JSON.stringify(label) +
          ')',
      );
    }, route + ' result');
  }
  console.log(
    'PASS 3/3 service bindings returned the same text result, 3 accepted jobs reopened after client closure.',
  );
} finally {
  for (const ws of sockets) ws.close();
  browser.kill('SIGTERM');
  await exit;
  await server.close();
  await trial.close();
  await rm(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
