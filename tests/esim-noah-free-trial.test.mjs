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
import { receiveLot } from '../services/operator-dock/src/distribution-stock.ts';
import { registerAddress } from '../services/operator-dock/src/distribution-address.ts';
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

await test('運営Dockの指定を本人の模擬回線に届け、受取と再送を照合する', async (t) => {
  const f = fixture(t);
  const credential = f.invite();
  const dockPassword = newCredential();
  const servers = await startTrialServers(f.trial, { dockPassword });
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
    for (const action of ['enroll', 'install', 'receive', 'revoke', 'logout'])
      assert.equal((await post('public', action)).status, 401, action);
    assert.equal((await post('public', 'unknown')).status, 404);
    const rejectedLogin = await post('public', 'login', { invite: 'invalid' });
    assert.equal(rejectedLogin.status, 403);
    assert.equal(rejectedLogin.headers.has('set-cookie'), false);
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
    const initial = await page('mobile');
    assert.match(initial, /いま指定されている配給はありません/);
    assert.doesNotMatch(
      initial,
      /農家検索|希望を選ぶ|name="item"|name="region"/,
    );
    assert.equal((await post('mobile', 'approve', request())).status, 404);
    const dockUrl = origins.dock + '/api/distributions';
    const auth =
      'Basic ' + Buffer.from('operator:' + dockPassword).toString('base64');
    const send = (data, origin = origins.dock) =>
      fetch(dockUrl, {
        method: 'POST',
        headers: {
          Authorization: auth,
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    assert.equal(
      (await fetch(dockUrl, { headers: { Cookie: cookie } })).status,
      401,
    );
    assert.equal(
      (
        await fetch(origins.mobile + '/api/distributions', {
          headers: { Cookie: cookie },
        })
      ).status,
      404,
    );
    assert.match(
      await (
        await fetch(origins.dock, { headers: { Authorization: auth } })
      ).text(),
      /配給を指定/,
    );
    const db = await f.trial.runtime.distributionDb();
    const lot = (item) =>
      receiveLot(db, {
        id: newApproval(),
        item,
        supplier: '試験用',
        units: 2,
        unit: '箱',
        cost_yen: 0,
        freight_yen: 0,
      });
    const input = {
      id: newApproval(),
      recipient: 'alice',
      lot_id: (await lot('試験用野菜セット')).id,
      units: 1,
      pickup: '東会場・土曜午前',
    };
    assert.equal((await send(input, origins.mobile)).status, 403);
    const address = {
      name: '配送試験A',
      postal: '０１２－３４５６',
      prefecture: '東京都',
      city: '架空試験市',
      street: '架空試験町1',
      building: '',
    };
    assert.equal((await send(input)).status, 409);
    assert.equal((await post('public', 'address', address)).status, 403);
    assert.equal(
      (await post('mobile', 'address', { ...address, recipient: 'bob' }))
        .status,
      400,
    );
    assert.equal(
      (await post('mobile', 'address', { ...address, postal: '1' })).status,
      400,
    );
    assert.equal((await post('mobile', 'address', address)).status, 303);
    const attempts = await Promise.all([send(input), send(input)]);
    assert.ok(attempts.every((r) => r.ok));
    assert.equal((await send({ ...input, units: 2 })).status, 409);
    f.invite('bob');
    const other = {
      ...input,
      id: newApproval(),
      recipient: 'bob',
      lot_id: (await lot('別の人の配給')).id,
    };
    await f.trial.enroll('bob');
    await f.trial.install('bob', 2);
    await registerAddress(await f.trial.runtime.distributionDb(), 'bob', {
      ...address,
      name: '配送試験B',
    });
    assert.ok((await send(other)).ok);
    const deadline = Date.now() + 15000;
    while (
      !(await page('public')).includes('更新があります') &&
      Date.now() < deadline
    )
      await new Promise((r) => setTimeout(r, 100));
    assert.match(await page('public'), /更新があります/);
    assert.doesNotMatch(await page('public'), /試験用野菜セット|東会場/);
    assert.match(await page('mobile'), /試験用野菜セット/);
    assert.doesNotMatch(await page('mobile'), /別の人の配給/);
    assert.equal(
      (await post('public', 'receive', { id: input.id })).status,
      403,
    );
    assert.equal(
      (await post('mobile', 'receive', { id: other.id })).status,
      404,
    );
    assert.equal(
      (await post('mobile', 'receive', { id: input.id, recipient: 'bob' }))
        .status,
      400,
    );
    assert.equal(
      (await post('mobile', 'receive', { id: input.id })).status,
      303,
    );
    const rows = async () =>
      (await fetch(dockUrl, { headers: { Authorization: auth } })).json();
    const first = (await rows()).find((row) => row.id === input.id);
    assert.ok(first.received_at > 0);
    assert.equal(
      (await post('mobile', 'receive', { id: input.id })).status,
      303,
    );
    assert.equal(
      (await rows()).find((row) => row.id === input.id).received_at,
      first.received_at,
    );
    assert.equal((await rows()).length, 2);
    assert.match(await page('mobile'), /受取済み/);
    assert.doesNotMatch(await page('public'), /更新があります/);
    assert.equal((await post('public', 'revoke')).status, 303);
    assert.doesNotMatch(await page('mobile'), /試験用野菜セット|東会場/);
    assert.equal(
      (await post('mobile', 'receive', { id: input.id })).status,
      403,
    );
    assert.equal((await post('mobile', 'logout')).status, 303);
    assert.match(await page('mobile'), /招待コードで入る/);
    assert.equal((await f.trial.jobs('alice')).length, 0);
  } finally {
    await servers.close();
  }
  await f.restart();
  const db = await f.trial.runtime.distributionDb();
  assert.equal(
    (
      await db
        .prepare(
          'SELECT count(*) AS total FROM distribution_assignments WHERE received_at IS NOT NULL',
        )
        .first()
    ).total,
    1,
  );
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

await test('Agentの実行中に期限が切れると成果を配達せず、同じ仕事の再送でも明細が増えない', async (t) => {
  const f = fixture(t);
  f.invite();
  await phone(f.trial);
  const input = request();
  await f.trial.approve('alice', true, input);
  f.advance(DELAY_MS);
  // Hold the delivery check after the package returns, while its work is still marked running.
  const originalPermit = f.trial.runtimePermit.bind(f.trial);
  let validations = 0;
  let arrived, resume;
  const waiting = new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error('Delivery check did not start')),
      15_000,
    );
    deadline.unref();
    arrived = () => {
      clearTimeout(deadline);
      resolve();
    };
  });
  const release = new Promise((resolve) => {
    resume = resolve;
  });
  f.trial.runtimePermit = async (owner) => {
    if (++validations === 2) {
      arrived();
      await release;
    }
    return originalPermit(owner);
  };
  const running = f.trial.recoverAlarms();
  try {
    await waiting;
    await assert.rejects(f.trial.stop('alice', input.id), { status: 409 });
    f.advance(TRIAL_MS);
  } finally {
    resume();
  }
  await running;
  await f.trial.recoverAlarms();
  const [row] = await f.trial.jobs('alice');
  assert.equal(row.state, 'interrupted');
  assert.equal(row.runs, null);
  assert.equal(row.result, null);
  assert.equal(await f.trial.hasUpdate('alice'), false);
});

await test('an eSIM cloud job survives a closed screen, lost provider reply and host restart without redispatch', async (t) => {
  let creations = 0,
    reads = 0,
    acknowledged = false;
  const stored = new Map();
  const provider = async (req) => {
    const id = new URL(req.url).pathname.split('/').pop();
    if (req.method === 'PUT') {
      creations++;
      assert.deepEqual(await req.json(), { text: 'abc' });
      stored.set(id, { id, result: '3 characters' });
      return new Response(null, { status: 503 });
    }
    reads++;
    return stored.has(id)
      ? acknowledged
        ? Response.json(stored.get(id))
        : new Response(null, { status: 202 })
      : new Response(null, { status: 404 });
  };
  const f = fixture(t, { routeBindings: { PROVIDER: provider } });
  f.invite();
  await phone(f.trial);
  const start = { id: newApproval(), text: 'abc', route: 'auto' };
  const run = (action, input) =>
    f.trial.cloudWork('alice', true, action, input);
  await assert.rejects(
    f.trial.cloudWork('alice', false, 'start', start),
    /回線/,
  );
  await run('start', start);
  // Only the server's alarm can contact the provider. No browser or status request drives execution.
  const until = async (predicate) => {
    const deadline = Date.now() + 20000;
    while (!(await predicate())) {
      if (Date.now() >= deadline)
        assert.fail(
          'Alarm failed to progress: ' +
            JSON.stringify({
              reads,
              creations,
              jobs: (await run('list')).jobs,
            }),
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  await until(() => creations === 1);
  assert.equal((await run('list')).jobs[0].route, 'provider');
  await f.restart();
  await until(() => reads >= 3);
  acknowledged = true;
  await until(async () => (await run('list')).jobs[0].state === 'completed');
  await run('start', start);
  const [saved] = (await run('list')).jobs;
  assert.equal(saved.result, '3 characters');
  assert.equal(creations, 1);
  await assert.rejects(run('start', { ...start, route: 'noah' }), /依頼内容/);
  for (const route of ['noah', 'registered']) {
    const id = newApproval();
    await run('start', { id, route, text: 'xy' });
    await until(async () => (await run('list')).jobs[0].state === 'completed');
    const view = await run('list');
    assert.equal(view.preference, route);
    assert.equal(view.jobs[0].route, route);
    assert.match(view.jobs[0].result, /文字数 2/);
  }
  const stopped = { id: newApproval(), route: 'provider', text: 'never send' };
  await run('start', stopped);
  await run('stop', { id: stopped.id });
  assert.equal((await run('list')).jobs[0].state, 'stopped');
  await f.trial.revoke('alice');
  await assert.rejects(run('list'), /回線/);
  assert.equal(creations, 1);
});

await test('partial results remain readable and the same work keeps polling for its missing outcome', async (t) => {
  let created = 0,
    lookups = 0,
    finish = false;
  const partial = {
    done: ['項目Aを集計'],
    incomplete: ['項目Bは集計中'],
    unverified: ['現物は未確認'],
  };
  const provider = async (req) => {
    const id = new URL(req.url).pathname.split('/').pop();
    if (req.method === 'PUT') {
      created++;
      return new Response(null, { status: 202 });
    }
    lookups++;
    if (!created) return new Response(null, { status: 404 });
    return Response.json({
      id,
      result: finish ? 'A+B' : 'A',
      final: finish,
      report: finish
        ? {
            done: [...partial.done, '項目Bを集計'],
            incomplete: [],
            unverified: partial.unverified,
          }
        : partial,
    });
  };
  const f = fixture(t, { routeBindings: { REGISTERED: provider } });
  f.invite();
  await phone(f.trial);
  const run = (action, input) =>
    f.trial.cloudWork('alice', true, action, input);
  await run('start', { id: newApproval(), route: 'registered', text: 'AB' });
  const wait = async (state) => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const job = (await run('list')).jobs[0];
      if (job.report && job.state === state) return job;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail('Timed out waiting for ' + state);
  };
  assert.deepEqual((await wait('waiting')).report, partial);
  finish = true;
  assert.deepEqual((await wait('completed')).report, {
    done: ['項目Aを集計', '項目Bを集計'],
    incomplete: [],
    unverified: partial.unverified,
  });
  assert.equal(created, 1);
  assert.ok(lookups >= 3);
});
