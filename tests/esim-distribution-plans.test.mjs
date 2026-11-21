import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { NoahTrial } from '../toolkits/esim-bootstrap/noah-trial/trial.mjs';
import { registerAddress } from '../services/operator-dock/src/distribution-address.ts';
import {
  assignDistribution,
  operatorAssignments,
} from '../services/operator-dock/src/distribution.ts';
import {
  receiveLot,
  stockLedger,
} from '../services/operator-dock/src/distribution-stock.ts';
import {
  createPlan,
  listPlans,
  runPlans,
  setPlan,
} from '../services/operator-dock/src/distribution-plans.ts';
const address = {
  name: '架空の試験用宛名',
  postal: '0000000',
  prefecture: '北海道',
  city: '架空市',
  street: '試験町',
  building: '',
};
const stock = {
  supplier: '試験団体',
  item: '試験資材',
  unit: '個',
  units: 1,
  cost_yen: 50,
  freight_yen: 0,
};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'noah-recurrence-'));
  const trial = new NoahTrial(dir);
  t.after(async () => {
    await trial.close();
    await rm(dir, { recursive: true, force: true });
  });
  return trial.runtime.distributionDb();
}
await test('two windows recheck address, line and stock; replay, shortage, replenishment, disable and expiry', async (t) => {
  const db = await fixture(t),
    firstAt = Date.now(),
    day = 86400000,
    lot = randomUUID(),
    who = 'qa-cycle';
  await registerAddress(db, who, address);
  await receiveLot(db, { id: lot, ...stock });
  const plan = {
    id: randomUUID(),
    recipient: who,
    template_lot: lot,
    units: 1,
    pickup: '架空配送枠',
    first_at: firstAt,
    interval_days: 1,
    window_hours: 4,
  };
  await createPlan(db, plan);
  await createPlan(db, plan);
  await assert.rejects(createPlan(db, { ...plan, interval_days: 2 }), {
    status: 409,
  });
  const allowed = async (owner) => owner === who;
  const tick = (now) => runPlans(db, allowed, now);
  await tick(firstAt - 1);
  assert.equal((await operatorAssignments(db)).length, 0);
  await Promise.all([tick(firstAt), tick(firstAt)]);
  const [first] = await operatorAssignments(db);
  assert.equal(first.lot_id, lot);
  await tick(firstAt + day);
  assert.equal((await listPlans(db)).windows[0].status, 'shortage');
  assert.equal((await operatorAssignments(db)).length, 1);
  const extra = randomUUID();
  await receiveLot(db, { id: extra, ...stock, units: 2, cost_yen: 75 });
  await runPlans(db, async () => false, firstAt + day + 60000);
  assert.equal((await listPlans(db)).windows[0].status, 'ineligible');
  await Promise.all([
    tick(firstAt + day + 120000),
    tick(firstAt + day + 120000),
  ]);
  const rows = await operatorAssignments(db);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.lot_id === extra && r.id !== first.id));
  assert.deepEqual(
    (await listPlans(db)).windows.map((w) => w.status),
    ['assigned', 'assigned'],
  );
  assert.equal(
    (await stockLedger(db)).reduce((n, l) => n + l.total_yen, 0),
    125,
  );
  await setPlan(db, plan.id, { enabled: false });
  await tick(firstAt + 2 * day);
  assert.equal((await operatorAssignments(db)).length, 2);
  assert.equal((await listPlans(db)).plans[0].enabled, 0);
  await setPlan(db, plan.id, { enabled: true });
  await tick(firstAt + 2 * day + 4 * 3600000);
  assert.equal((await listPlans(db)).windows[0].status, 'missed');
  assert.equal((await operatorAssignments(db)).length, 2);
});
await test(
  'bounded capacity experiment allocates exactly 1,000 synthetic recipients and replays each request',
  { skip: process.env.NOAH_DISTRIBUTION_CAPACITY !== '1000' },
  async (t) => {
    const db = await fixture(t),
      lot = randomUUID();
    await receiveLot(db, { id: lot, ...stock, units: 1000 });
    const requests = Array.from({ length: 1000 }, (_, i) => ({
      id: randomUUID(),
      recipient: 'fixture-' + i,
      lot_id: lot,
      units: 1,
      pickup: '架空配送枠',
    }));
    const start = performance.now();
    for (let i = 0; i < requests.length; i += 10) {
      await Promise.all(
        requests.slice(i, i + 10).map(async (req) => {
          await registerAddress(db, req.recipient, address);
          await assignDistribution(db, req);
          await assignDistribution(db, req);
        }),
      );
    }
    const counts = await db
      .prepare(
        'SELECT count(*) AS assignments,count(distinct recipient) AS recipients,sum(units) AS allocated FROM distribution_assignments',
      )
      .first();
    const [ledger] = await stockLedger(db);
    assert.deepEqual(counts, {
      assignments: 1000,
      recipients: 1000,
      allocated: 1000,
    });
    assert.equal(ledger.available, 0);
    assert.equal(ledger.awaiting, 1000);
    t.diagnostic(
      JSON.stringify({
        ...counts,
        replays: 1000,
        extraAssignments: 0,
        available: ledger.available,
        failures: 0,
        elapsedMs: Math.round(performance.now() - start),
        adapter: 'local workerd D1',
      }),
    );
  },
);
