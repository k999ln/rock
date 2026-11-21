import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureEsimProvider } from '../toolkits/esim-bootstrap/core.mjs';
import {
  DELAY_MS,
  NoahTrial,
  newApproval,
  newCredential,
  TRIAL_MS,
} from '../toolkits/esim-bootstrap/noah-trial/trial.mjs';
import { startTrialServers } from '../toolkits/esim-bootstrap/noah-trial/server.mjs';
import { base } from '../toolkits/esim-bootstrap/noah-trial/view.mjs';

function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'noah-trial-'));
  let time = 1_800_000_000_000;
  const now = () => time;
  const make = () => new NoahTrial(directory, { now, ...options });
  const f = {
    trial: make(),
    advance: (ms) => {
      time += ms;
    },
    async restart() {
      await this.trial.close();
      this.trial = make();
    },
  };
  t.after(async () => {
    await f.trial.close();
    rmSync(directory, { recursive: true, force: true });
  });
  f.invite = (owner = 'alice') => {
    const secret = newCredential();
    f.trial.invite(owner, secret, now() + TRIAL_MS);
    return secret;
  };
  return f;
}
async function phone(trial, owner = 'alice') {
  await trial.enroll(owner);
  await trial.install(owner);
}
const request = () => ({ id: newApproval(), region: 'tokyo', item: 'rice' });

await test('模擬回線の入口を経由して0円申込、再開、実行、通知、成果と使用量を照合する', async (t) => {
  const f = fixture(t);
  const credential = f.invite();
  const servers = await startTrialServers(f.trial);
  const { origins } = servers;
  try {
    let cookie = '';
    const post = async (line, action, fields = {}, origin = origins[line]) =>
      fetch(origins[line] + base + action, {
        method: 'POST',
        headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
        body: new URLSearchParams(fields),
        redirect: 'manual',
      });
    const page = async (line) =>
      (
        await fetch(origins[line] + base, { headers: { Cookie: cookie ?? '' } })
      ).text();
    assert.match(await page('public'), /招待コードで入る/);
    assert.equal((await post('public', 'enroll')).status, 401);
    const login = await post('public', 'login', { invite: credential });
    cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.equal(
      (await post('public', 'enroll', {}, 'https://example.invalid')).status,
      403,
    );
    const duplicate = await Promise.all([
      post('public', 'enroll'),
      post('public', 'enroll'),
    ]);
    assert.ok(duplicate.every((r) => r.status === 303));
    assert.match(await page('public'), /模擬端末に追加する/);
    assert.equal((await post('public', 'install')).status, 303);
    const input = request();
    assert.equal((await post('public', 'approve', input)).status, 403);
    assert.equal((await post('mobile', 'approve', input)).status, 303);
    assert.equal((await post('mobile', 'approve', input)).status, 303);
    assert.match(await page('mobile'), /案内を準備中/);
    f.advance(DELAY_MS);
    await f.trial.recoverAlarms(); // no browser request triggers the server-side work
    assert.match(await page('public'), /更新があります/);
    assert.doesNotMatch(
      await page('public'),
      /サンプル東会場|sample-tokyo-rice/,
    );
    assert.match(await page('mobile'), /サンプル東会場/);
    assert.match(await page('mobile'), /Agent 1回 ／ 0円/);
    assert.equal((await post('public', 'read', { id: input.id })).status, 403);
    assert.equal((await post('mobile', 'read', { id: input.id })).status, 303);
    assert.equal((await post('mobile', 'read', { id: input.id })).status, 303);
    assert.doesNotMatch(await page('public'), /更新があります/);
    assert.equal((await post('mobile', 'logout')).status, 303);
    assert.match(await page('mobile'), /招待コードで入る/);
    assert.equal((await f.trial.jobs('alice')).length, 1);
  } finally {
    await servers.close();
  }
});

await test('別の本人、同じ申込、不正な地域、失効を区別する', async (t) => {
  const f = fixture(t);
  f.invite();
  f.invite('bob');
  await phone(f.trial);
  const before = f.trial.order('alice').id;
  await f.trial.enroll('alice');
  assert.equal(f.trial.order('alice').id, before);
  const input = request();
  await assert.rejects(
    f.trial.approve('alice', true, { ...input, region: 'unknown' }),
  );
  await f.trial.approve('alice', true, input);
  await assert.rejects(
    f.trial.approve('alice', true, { ...input, item: 'soap' }),
  );
  await f.trial.enroll('bob');
  await assert.rejects(f.trial.install('bob'), { status: 409 });
  await assert.rejects(f.trial.receive('bob', true, input.id), { status: 403 });
  await f.trial.revoke('alice');
  await assert.rejects(f.trial.gate('alice', true), { status: 403 });
  f.advance(DELAY_MS);
  await f.trial.recoverAlarms();
  assert.equal((await f.trial.jobs('alice'))[0].state, 'stopped');
  assert.equal((await f.trial.jobs('bob')).length, 0);
});

await test('ブラウザを閉じ、サーバーを再起動しても同じ仕事と受領記録が残る', async (t) => {
  const f = fixture(t);
  const invite = f.invite();
  const session = f.trial.login(invite);
  await phone(f.trial);
  const input = request();
  await f.trial.approve('alice', true, input);
  await f.restart();
  f.advance(DELAY_MS);
  await Promise.all([f.trial.recoverAlarms(), f.trial.recoverAlarms()]);
  assert.equal(f.trial.session(session).owner, 'alice');
  assert.equal(f.trial.session(f.trial.login(invite)).owner, 'alice');
  assert.equal((await f.trial.jobs('alice'))[0].runs, 1);
  assert.equal((await f.trial.jobs('alice'))[0].yen, 0);
  await f.trial.receive('alice', true, input.id);
  const readAt = (await f.trial.jobs('alice'))[0].read_at;
  await f.restart();
  f.advance(10);
  await f.trial.receive('alice', true, input.id);
  assert.equal((await f.trial.jobs('alice'))[0].read_at, readAt);
});

await test('停止、招待期限、供給元で無効になった回線では実行しない', async (t) => {
  const f = fixture(t);
  const invite = f.invite();
  const session = f.trial.login(invite);
  await phone(f.trial);
  const first = request();
  await f.trial.approve('alice', true, first);
  await f.trial.stop('alice', first.id);
  const second = request();
  await f.trial.approve('alice', true, second);
  f.trial.provider.setState(f.trial.order('alice').id, 'disabled');
  f.advance(DELAY_MS);
  await f.trial.recoverAlarms();
  assert.ok(
    (await f.trial.jobs('alice')).every(
      (row) => row.state === 'stopped' && row.runs === null,
    ),
  );
  assert.equal(await f.trial.hasUpdate('alice'), false);
  f.trial.provider.setState(f.trial.order('alice').id, 'enabled');
  await f.trial.enroll('alice');
  await f.trial.approve('alice', true, request());
  f.advance(TRIAL_MS);
  await f.trial.recoverAlarms();
  assert.equal(f.trial.session(session), null);
  assert.throws(() => f.trial.login(invite), { status: 403 });
  assert.ok(
    (await f.trial.jobs('alice')).every((row) => row.state === 'stopped'),
  );
});

await test('該当なしと台帳取得失敗を分けて保存する', async (t) => {
  let offline = false;
  const f = fixture(t, {
    readOffers: () => {
      if (offline) throw new Error();
      return [];
    },
  });
  f.invite();
  await phone(f.trial);
  for (const expected of ['empty', 'unavailable']) {
    await f.trial.approve('alice', true, request());
    f.advance(DELAY_MS);
    await f.trial.recoverAlarms();
    assert.equal(
      JSON.parse((await f.trial.jobs('alice'))[0].result).outcome,
      expected,
    );
    offline = true;
  }
});

await test('模擬事業者の発行応答が消えても再申込で二重発行しない', async (t) => {
  const provider = new FixtureEsimProvider(':memory:');
  const issue = provider.issue.bind(provider);
  let count = 0;
  provider.issue = async (id) => {
    count++;
    await issue(id);
    throw new Error('after issuance');
  };
  const f = fixture(t, { provider });
  f.invite();
  const first = await f.trial.enroll('alice');
  assert.equal(first.state, 'reconciliation_required');
  const second = await f.trial.enroll('alice');
  assert.equal(second.state, 'issued');
  assert.equal(first.id, second.id);
  assert.equal(count, 1);
});

await test(
  'Workersのalarmがブラウザ終了後に仕事を完了し、同じ招待で開き直して受け取れる',
  { timeout: 30_000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'noah-trial-alarm-'));
    const trial = new NoahTrial(directory);
    t.after(async () => {
      await trial.close();
      rmSync(directory, { recursive: true, force: true });
    });
    const invite = newCredential();
    trial.invite('alice', invite, Date.now() + TRIAL_MS);
    const first = trial.login(invite);
    await phone(trial);
    const input = request();
    await trial.approve('alice', true, input);
    trial.logout(first);
    const deadline = Date.now() + 20_000;
    // Read only the generic notification flag. Reading does not schedule or execute work.
    while (!(await trial.hasUpdate('alice')) && Date.now() < deadline)
      await new Promise((done) => setTimeout(done, 200));
    assert.equal(trial.session(first), null);
    assert.equal(trial.session(trial.login(invite)).owner, 'alice');
    await trial.receive('alice', true, input.id);
    const [job] = await trial.jobs('alice');
    assert.equal(job.state, 'delivered');
    assert.equal(job.runs, 1);
    assert.equal(job.yen, 0);
    assert.equal(JSON.parse(job.result).entries[0].id, 'sample-tokyo-rice');
  },
);

await test('無料か判断できない事業者条件では発行せず、無料を確認後に同じ申込で再開する', async (t) => {
  const provider = new FixtureEsimProvider(':memory:');
  const quote = provider.quoteFreeTrial.bind(provider);
  const f = fixture(t, { provider });
  f.invite();
  const bad = [
    null,
    { ...quote(), recurringMinor: 30 },
    { ...quote(), autoRenew: true },
    { ...quote(), endMinor: undefined },
  ];
  let order;
  for (const value of bad) {
    provider.quoteFreeTrial = () => value;
    assert.equal(await f.trial.freeLineAvailable(), false);
    await assert.rejects(f.trial.enroll('alice'), { status: 409 });
    order = f.trial.order('alice');
    assert.equal(order.state, 'requested');
    assert.equal(await provider.lookup(order.id), null);
  }
  provider.quoteFreeTrial = quote;
  assert.equal((await f.trial.enroll('alice')).id, order.id);
  await Promise.all([f.trial.install('alice'), f.trial.install('alice')]);
  assert.equal((await provider.lookup(order.id)).version, 2);
});

await test('利用者または運営の費用が不明・有料なら新規承認と予定された実行を止める', async (t) => {
  let price = { currency: 'JPY', customerMinor: 0, operatorMinor: 0 };
  const f = fixture(t, { readQuote: () => price });
  f.invite();
  await phone(f.trial);
  const free = price;
  for (const changed of [
    { ...free, operatorMinor: 1 },
    { ...free, customerMinor: 1 },
    { ...free, currency: 'USD' },
    null,
  ]) {
    price = changed;
    await assert.rejects(f.trial.approve('alice', true, request()), {
      status: 409,
    });
  }
  price = free;
  await f.trial.approve('alice', true, request());
  price = { ...free, operatorMinor: null };
  f.advance(DELAY_MS);
  await f.trial.recoverAlarms();
  const [job] = await f.trial.jobs('alice');
  assert.equal(job.state, 'stopped');
  assert.equal(job.runs, null);
});

await test('成果の検収は元の台帳・選択・全件数と一致したときだけ通る', async () => {
  const { sampleOffers, runGuide, acceptGuideResult } =
    await import('../services/noah-test-runtime/src/esim-trial/guide.mjs');
  const good = runGuide(sampleOffers, 'tokyo', 'rice');
  assert.ok(acceptGuideResult(sampleOffers, 'tokyo', 'rice', good));
  assert.equal(acceptGuideResult(sampleOffers, 'osaka', 'rice', good), false);
  assert.equal(
    acceptGuideResult(sampleOffers, 'tokyo', 'rice', { ...good, entries: [] }),
    false,
  );
  assert.equal(
    acceptGuideResult(sampleOffers, 'tokyo', 'rice', {
      ...good,
      source: '別の資料',
    }),
    false,
  );
  const empty = runGuide(sampleOffers, 'osaka', 'rice');
  assert.equal(acceptGuideResult(null, 'osaka', 'rice', empty), false);
});
