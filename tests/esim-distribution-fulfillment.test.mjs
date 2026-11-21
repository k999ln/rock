import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  NoahTrial,
  newCredential,
  TRIAL_MS,
} from '../toolkits/esim-bootstrap/noah-trial/trial.mjs';
import { startTrialServers } from '../toolkits/esim-bootstrap/noah-trial/server.mjs';
import { base } from '../toolkits/esim-bootstrap/noah-trial/view.mjs';
import {
  registerAddress,
  shippingAddress,
} from '../services/operator-dock/src/distribution-address.ts';
import {
  assignDistribution,
  receiveAssignment,
  recipientAssignments,
  recipientHasPending,
  operatorAssignments,
} from '../services/operator-dock/src/distribution.ts';
import {
  stockLedger,
  receiveLot,
} from '../services/operator-dock/src/distribution-stock.ts';
import { deliverNotices } from '../services/operator-dock/src/distribution-notices.ts';

const address = (name) => ({
  name,
  postal: '０１２－３４５６',
  prefecture: '東京都',
  city: '架空試験市',
  street: '架空試験町一番地',
  building: '',
});
const sampleLot = () => ({
  id: randomUUID(),
  supplier: '試験仕入先',
  item: '試験野菜',
  unit: '箱',
  units: 10,
  cost_yen: 1200,
  freight_yen: 300,
});
const allocate = (lot, recipient, units) => ({
  id: randomUUID(),
  lot_id: lot.id,
  recipient,
  units,
  pickup: '架空配送枠・日曜午前',
});
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'distribution-fulfillment-'));
  const f = { trial: new NoahTrial(directory), servers: [] };
  f.shutdown = async () => {
    for (const server of f.servers) await server.close();
    f.servers = [];
    await f.trial.close();
  };
  f.restart = async () => {
    await f.shutdown();
    f.trial = new NoahTrial(directory);
  };
  t.after(async () => {
    await f.shutdown();
    await rm(directory, { recursive: true, force: true });
  });
  return f;
}
async function until(check) {
  const deadline = Date.now() + 15000;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, 'background notice did not complete');
    await delay(80);
  }
}
async function member(server, invite) {
  const { origins } = server;
  let cookie = '';
  const send = (side, action, data = {}) =>
    fetch(origins[side] + base + action, {
      method: 'POST',
      headers: { Origin: origins[side], Cookie: cookie },
      body: new URLSearchParams(data),
      redirect: 'manual',
    });
  const get = (side, path = '') =>
    fetch(origins[side] + base + path, { headers: { Cookie: cookie } });
  const login = await send('public', 'login', { invite });
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await send('public', 'enroll')).status, 303);
  assert.equal((await send('public', 'enroll')).status, 303);
  assert.equal((await send('public', 'install')).status, 303);
  return { get, send };
}

await test('two handset sessions share one stock ledger, preserve address snapshots and reconcile one closed-tab result', async (t) => {
  const f = await fixture(t),
    password = newCredential();
  const credentials = [newCredential(), newCredential()];
  for (const [i, owner] of ['qa-a', 'qa-b'].entries()) {
    f.trial.invite(owner, credentials[i], Date.now() + TRIAL_MS);
    f.servers.push(
      await startTrialServers(f.trial, {
        handsetSlot: i + 1,
        dockPassword: password,
      }),
    );
  }
  const db = await f.trial.runtime.distributionDb();
  const [a, b] = await Promise.all(
    f.servers.map((s, i) => member(s, credentials[i])),
  );
  const access =
    'Basic ' + Buffer.from('operator:' + password).toString('base64');
  const dock = f.servers[0].origins.dock;
  const api = (path, body) =>
    fetch(dock + '/api/distributions' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: access,
        Origin: dock,
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
    });
  const lot = sampleLot(),
    first = allocate(lot, 'qa-a', 4),
    second = allocate(lot, 'qa-b', 3);
  assert.equal((await api('/lots', lot)).status, 200);
  assert.equal((await api('/lots', lot)).status, 200);
  assert.equal((await api('/lots', { ...lot, cost_yen: 0 })).status, 409);
  assert.equal((await api('', first)).status, 409);
  assert.equal(
    (await a.send('public', 'address', address('試験宛名A'))).status,
    403,
  );
  assert.equal(
    (await a.send('mobile', 'address', address('試験宛名A'))).status,
    303,
  );
  assert.equal(
    (await b.send('mobile', 'address', address('試験宛名B'))).status,
    303,
  );
  assert.doesNotMatch(
    await (await b.get('mobile', 'address')).text(),
    /試験宛名A/,
  );
  assert.equal((await api('', first)).status, 200);
  assert.equal((await api('', second)).status, 200);
  assert.equal((await api('', { ...first, recipient: 'qa-b' })).status, 409);
  assert.equal((await api('', { ...first, units: 3 })).status, 409);
  assert.equal((await api('', { ...first, lot_id: randomUUID() })).status, 409);
  const stock = async () => {
    const [l] = await (await api('/lots')).json();
    return [l.available, l.awaiting, l.acknowledged, l.total_yen];
  };
  assert.deepEqual(await stock(), [3, 7, 0, 1500]);
  await a.send('mobile', 'address', {
    ...address('試験宛名A'),
    street: '架空の変更先二番地',
  });
  assert.equal(
    (await (await api('/' + first.id + '/address')).json()).street,
    '架空試験町一番地',
  );
  // Neither handset is making requests while the first-party Agent creates its result.
  await until(async () =>
    (await operatorAssignments(db)).every((r) => r.notice_state === 'ready'),
  );
  const generic = await (await a.get('public')).text();
  assert.match(generic, /更新があります/);
  assert.doesNotMatch(generic, /架空|試験宛名|試験野菜|1500|notice:/);
  assert.equal((await a.get('public', 'address')).status, 403);
  assert.equal(
    (await b.send('mobile', 'receive', { id: first.id })).status,
    404,
  );
  for (let i = 0; i < 3; i++)
    assert.match(await (await a.get('mobile')).text(), /4箱/);
  assert.doesNotMatch(
    await (await b.get('mobile')).text(),
    /4箱|試験宛名A|仕入先|1500/,
  );
  assert.equal(
    (await a.send('mobile', 'receive', { id: first.id })).status,
    303,
  );
  const original = (await operatorAssignments(db)).find(
    (r) => r.id === first.id,
  );
  assert.equal(original.result_id, 'notice:' + first.id);
  assert.equal(original.usage_yen, 0);
  assert.deepEqual(await stock(), [3, 3, 4, 1500]);
  const race = [allocate(lot, 'qa-a', 3), allocate(lot, 'qa-b', 3)];
  const responses = await Promise.all(race.map((row) => api('', row)));
  assert.deepEqual(
    responses.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  const winner = race[responses.findIndex((r) => r.ok)];
  assert.equal((await api('', winner)).status, 200);
  assert.deepEqual(await stock(), [0, 6, 4, 1500]);
  await until(async () =>
    (await operatorAssignments(db)).every((r) => r.notice_state === 'ready'),
  );
  assert.equal((await operatorAssignments(db)).length, 3);
  // Simulate a lost receive response, then reopen the same session on the same listeners.
  const ports = f.servers.map((s) =>
    Object.fromEntries(
      Object.entries(s.origins).map(([k, v]) => [
        k + 'Port',
        Number(new URL(v).port),
      ]),
    ),
  );
  await f.restart();
  for (const [i, p] of ports.entries())
    f.servers.push(
      await startTrialServers(f.trial, {
        ...p,
        handsetSlot: i + 1,
        dockPassword: password,
      }),
    );
  assert.equal(
    (await a.send('mobile', 'receive', { id: first.id })).status,
    303,
  );
  const after = (await (await api('')).json()).find((r) => r.id === first.id);
  assert.equal(after.received_at, original.received_at);
  assert.equal(after.result_id, original.result_id);
  assert.equal((await a.send('public', 'revoke')).status, 303);
  assert.equal(
    (await a.send('mobile', 'address', address('失効'))).status,
    403,
  );
  assert.equal((await a.get('mobile', 'address')).status, 403);
  assert.equal(
    (await a.send('mobile', 'receive', { id: first.id })).status,
    403,
  );
  assert.deepEqual(await stock(), [0, 6, 4, 1500]);
  f.trial.db
    .prepare('UPDATE trial_owners SET expires=? WHERE owner=?')
    .run(Date.now() - 1000, 'qa-b');
  assert.equal((await b.get('mobile', 'address')).status, 401);
  assert.equal(
    (await b.send('mobile', 'receive', { id: second.id })).status,
    401,
  );
  assert.deepEqual(await stock(), [0, 6, 4, 1500]);
  t.diagnostic(
    JSON.stringify({
      assignment: first.id,
      work: first.id,
      result: after.result_id,
      ready: new Date(after.ready_at).toISOString(),
      received: new Date(after.received_at).toISOString(),
      polls: after.attempts,
      assignments: 3,
      acknowledged: 1,
      lot: { available: 0, awaiting: 6, acknowledged: 4, operatorYen: 1500 },
      recipientYen: 0,
    }),
  );
});

await test('upgrade preserves historical quantities and timestamps; stock costs preserve unknowns', async (t) => {
  const f = await fixture(t);
  const db = await f.trial.runtime.runtime.getD1Database(
    'DISTRIBUTIONS',
    'noah-trial-distribution-store',
  );
  const sql = await readFile(
    new URL(
      '../services/operator-dock/migrations/0003_distribution.sql',
      import.meta.url,
    ),
    'utf8',
  );
  for (const part of sql.split(';').filter((s) => s.trim()))
    await db.prepare(part).run();
  const ids = [randomUUID(), randomUUID()];
  for (const [i, id] of ids.entries())
    await db
      .prepare('INSERT INTO distribution_assignments VALUES(?,?,?,?,?,?,?)')
      .bind(
        id,
        'old-user',
        '旧配給品',
        'ひと包み',
        '架空窓口',
        10,
        i ? 1234 : null,
      )
      .run();
  await f.trial.runtime.distributionDb();
  assert.equal(
    (await receiveAssignment(db, 'old-user', ids[1])).received_at,
    1234,
  );
  await assert.rejects(receiveAssignment(db, 'old-user', ids[0]), {
    status: 409,
  });
  await registerAddress(db, 'old-user', address('旧データ試験'));
  assert.ok(
    (await receiveAssignment(db, 'old-user', ids[0])).received_at > 1234,
  );
  assert.equal((await shippingAddress(db, ids[0])).name, '旧データ試験');
  const rows = await recipientAssignments(db, 'old-user');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].quantity, 'ひと包み');
  await receiveLot(db, { ...sampleLot(), cost_yen: null, freight_yen: 0 });
  const [lot] = await stockLedger(db);
  assert.equal(lot.total_yen, null);
  assert.equal(lot.available, 10);
  await f.restart();
  assert.equal(
    (await operatorAssignments(await f.trial.runtime.distributionDb())).length,
    2,
  );
});

await test('interrupted dispatch, replayed notice, stop and temporary DB failure preserve the committed work', async (t) => {
  const f = await fixture(t);
  const db = await f.trial.runtime.distributionDb(),
    who = 'retry-member';
  f.trial.invite(who, newCredential(), Date.now() + TRIAL_MS);
  await f.trial.enroll(who);
  await f.trial.install(who);
  await registerAddress(db, who, address('再送試験'));
  const lot = sampleLot();
  await receiveLot(db, lot);
  const job = allocate(lot, who, 1);
  await assignDistribution(db, job);
  const agent = await f.trial.runtime.runtime.getWorker(
    'noah-distribution-agent',
  );
  const ask = (action, id) =>
    agent.fetch('https://notice.invalid/' + action, {
      method: 'POST',
      body: JSON.stringify({ id, owner: who }),
    });
  let starts = 0;
  await deliverNotices(db, {
    fetch: async (url, init) => {
      const response = await agent.fetch(url, init);
      if (url.endsWith('/start')) {
        starts++;
        throw Error('lost reply');
      }
      return response;
    },
  });
  assert.equal(await recipientHasPending(db, who), false);
  await until(
    async () =>
      (await (await ask('state', job.id)).json()).state === 'completed',
  );
  for (let i = 0; i < 3; i++)
    await deliverNotices(db, agent, Date.now() + 60000);
  assert.equal(starts, 1);
  assert.equal((await operatorAssignments(db))[0].usage_yen, 0);
  const other = allocate(lot, who, 1);
  await assignDistribution(db, other);
  await ask('start', other.id);
  await ask('stop', other.id);
  await deliverNotices(db, agent);
  const stopped = (await operatorAssignments(db)).find(
    (r) => r.id === other.id,
  );
  assert.equal(stopped.notice_state, 'stopped');
  assert.equal(stopped.usage_yen, null);
  assert.equal((await recipientAssignments(db, who)).length, 1);
  const dockPassword = newCredential();
  const servers = await startTrialServers(f.trial, { dockPassword });
  f.servers.push(servers);
  const original = f.trial.runtime.distributionDb.bind(f.trial.runtime);
  f.trial.runtime.distributionDb = async () => {
    throw Error('injected private storage outage');
  };
  const headers = {
    Authorization:
      'Basic ' + Buffer.from('operator:' + dockPassword).toString('base64'),
  };
  const response = await fetch(servers.origins.dock + '/api/distributions', {
    headers,
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /injected/);
  f.trial.runtime.distributionDb = original;
  assert.equal(
    (await fetch(servers.origins.dock + '/api/distributions', { headers }))
      .status,
    200,
  );
});
