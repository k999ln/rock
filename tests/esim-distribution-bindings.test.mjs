import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { esimCloudRequestScope } from '../lib/esim-cloud-access.ts';
import { distributionRoot } from '../lib/noah-distribution-routes.mjs';
import { distributionApi } from '../services/operator-dock/src/distribution-api.ts';
import { deliverNotices } from '../services/operator-dock/src/distribution-notices.ts';

const bundle = (entry) =>
  buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    external: ['cloudflare:workers'],
  }).outputFiles[0].text;
await test('private recipient binding connects the authenticated web request, Dock D1 and a Noah alarm on workerd', async (t) => {
  let active = true,
    expectedBody = '';
  const account = 'qa-account',
    owner = 'qa-private-owner';
  const quote = { currency: 'JPY', customerMinor: 0, operatorMinor: 0 };
  const line = async (req) => {
    const p = await req.json();
    assert.equal(JSON.stringify(p).includes('架空配送試験町'), false);
    if (new URL(req.url).pathname === '/authorize') {
      if (
        p.evidence !== 'fixture-proof' ||
        p.account !== account ||
        p.bodySha256 !== createHash('sha256').update(expectedBody).digest('hex')
      )
        return Response.json({}, { status: 403 });
      return Response.json({ active, account, owner });
    }
    assert.equal(p.owner, owner);
    return Response.json({
      active,
      enrollment: 'synthetic-line',
      device: 'synthetic-handset',
      quote,
    });
  };
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: '',
          script: bundle('services/noah-test-runtime/src/cloud-entry.mjs'),
          modules: true,
          compatibilityDate: '2026-10-01',
          durableObjects: {
            NOTICES: { className: 'DistributionWork', useSQLite: true },
          },
          serviceBindings: {
            LINE: line,
            RECIPIENT: { name: 'dock', entrypoint: 'RecipientDistribution' },
          },
        },
        {
          name: 'dock',
          script: bundle('services/operator-dock/src/recipient-entry.ts'),
          modules: true,
          compatibilityDate: '2026-10-01',
          d1Databases: ['DB'],
          serviceBindings: {
            DISTRIBUTION_AGENT: {
              name: '',
              entrypoint: 'NoahDistributionAgent',
            },
          },
        },
        {
          name: 'operator-test-driver',
          script:
            'export default {fetch(req,env){return env.AGENT.fetch(req)}}',
          modules: true,
          compatibilityDate: '2026-10-01',
          serviceBindings: {
            AGENT: { name: '', entrypoint: 'NoahDistributionAgent' },
          },
        },
      ],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB', 'dock'),
    agent = await mf.getWorker('operator-test-driver');
  for (const name of [
    '0003_distribution',
    '0004_distribution_fulfillment',
    '0005_distribution_plans',
  ]) {
    const sql = await readFile(
      new URL(
        '../services/operator-dock/migrations/' + name + '.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await db.batch(
      sql
        .split(';')
        .filter((v) => v.trim())
        .map((v) => db.prepare(v)),
    );
  }
  const url = 'https://noah.test' + distributionRoot;
  const call = async (path, fields, proof = 'fixture-proof', who = account) => {
    expectedBody = fields ? new URLSearchParams(fields).toString() : '';
    const req = new Request(url + path, {
      method: fields ? 'POST' : 'GET',
      headers: {
        'X-Noah-Account': who,
        'X-Noah-Carrier-Proof': proof,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: fields ? expectedBody : undefined,
      redirect: 'manual',
    });
    assert.equal(esimCloudRequestScope(req), 'noah');
    return mf.dispatchFetch(req.url, {
      method: req.method,
      headers: Object.fromEntries(req.headers),
      body: fields ? expectedBody : undefined,
      redirect: 'manual',
    });
  };
  const addr = {
    name: '架空宛名',
    postal: '0123456',
    prefecture: '東京都',
    city: '架空市',
    street: '架空配送試験町',
    building: '',
  };
  assert.equal((await call('/address', addr, '')).status, 403);
  assert.equal(
    (await call('/address', { ...addr, recipient: 'qa-other' })).status,
    400,
  );
  assert.equal((await call('/address', addr)).status, 303);
  assert.match(await (await call('/address')).text(), /架空配送試験町/);
  const lot = await distributionApi(db, '/api/distributions/lots', 'POST', {
    id: randomUUID(),
    supplier: '運営用窓口',
    item: '架空配給品',
    units: 2,
    unit: '個',
    cost_yen: 1200,
    freight_yen: 0,
  });
  const id = randomUUID();
  const eligible = async (recipient) =>
    (
      await (
        await agent.fetch('https://notice.invalid/eligible', {
          method: 'POST',
          body: JSON.stringify({ owner: recipient }),
        })
      ).json()
    ).eligible;
  await distributionApi(
    db,
    '/api/distributions',
    'POST',
    { id, recipient: owner, lot_id: lot.id, units: 1, pickup: '架空受取枠' },
    eligible,
  );
  await deliverNotices(db, agent);
  const deadline = Date.now() + 10000;
  for (;;) {
    const job = await (
      await agent.fetch('https://notice.invalid/state', {
        method: 'POST',
        body: JSON.stringify({ id, owner }),
      })
    ).json();
    if (job.state === 'completed') break;
    assert.ok(Date.now() < deadline);
    await delay(100);
  }
  await deliverNotices(db, agent, Date.now() + 60000);
  const ordinary = await (await call('/notice', undefined, '')).text();
  assert.match(ordinary, /更新があります/);
  assert.doesNotMatch(ordinary, /架空配給品|運営用窓口|架空配送試験町/);
  assert.doesNotMatch(
    await (await call('/notice', undefined, '', 'qa-other')).text(),
    /更新があります/,
  );
  const inbox = await (await call('')).text();
  assert.match(inbox, /架空配給品/);
  assert.doesNotMatch(inbox, /運営用窓口|架空配送試験町/);
  assert.equal((await call('/receive', { id }, '')).status, 403);
  assert.equal((await call('/receive', { id })).status, 303);
  assert.match(await (await call('')).text(), /受取済み/);
  assert.doesNotMatch(
    await (await call('/notice', undefined, '')).text(),
    /更新があります/,
  );
  active = false;
  assert.equal((await call('/address')).status, 403);
  assert.equal((await call('/receive', { id })).status, 403);
  assert.equal(
    esimCloudRequestScope(new Request(url + '/address/other')),
    null,
  );
});
