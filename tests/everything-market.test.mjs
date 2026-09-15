import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  canonicalJson,
  proposalDigest,
  validateMarketProposal,
  validateNewMarketAsset,
} from '../lib/everything-market.ts';
import { everythingMarketStore } from '../lib/everything-market-store.ts';

void test('generic market accepts typed assets and PAPER proposals', () => {
  assert.deepEqual(
    validateNewMarketAsset({
      title: '動画編集 1本',
      description: '素材受領から初稿納品までの編集枠です。',
      category: 'service',
      unit: 'video',
      referencePriceMinor: 4500,
    }),
    {
      title: '動画編集 1本',
      description: '素材受領から初稿納品までの編集枠です。',
      category: 'service',
      unit: 'video',
      referencePriceMinor: 4500,
    },
  );
  assert.equal(
    validateMarketProposal(
      {
        assetId: 'rock:editing-slot',
        side: 'buy',
        priceMinor: 3800,
        quantity: 2,
        mode: 'PAPER',
        expiresAt: '2026-09-13T00:15:00.000Z',
      },
      Date.parse('2026-09-13T00:00:00.000Z'),
    ).mode,
    'PAPER',
  );
});

void test('market fails closed for LIVE, expired and unknown inputs', () => {
  const base = {
    assetId: 'rock:editing-slot',
    side: 'buy',
    priceMinor: 3800,
    quantity: 1,
    mode: 'PAPER',
    expiresAt: '2026-09-13T00:15:00.000Z',
  };
  assert.throws(
    () =>
      validateMarketProposal(
        { ...base, mode: 'LIVE' },
        Date.parse('2026-09-13T00:00:00.000Z'),
      ),
    /実資金取引/,
  );
  assert.throws(
    () =>
      validateMarketProposal(
        { ...base, expiresAt: '2026-09-12T23:59:00.000Z' },
        Date.parse('2026-09-13T00:00:00.000Z'),
      ),
    /有効期限/,
  );
  assert.throws(
    () =>
      validateMarketProposal(
        { ...base, secret: 'nope' },
        Date.parse('2026-09-13T00:00:00.000Z'),
      ),
    /未対応/,
  );
});

void test('proposal digest is canonical and binds every exact field', async () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  const first = await proposalDigest({ assetId: 'a', priceMinor: 100 });
  const same = await proposalDigest({ priceMinor: 100, assetId: 'a' });
  const changed = await proposalDigest({ priceMinor: 101, assetId: 'a' });
  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

void test('D1 runtime keeps exact approval, idempotency and owner isolation', async (t) => {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("market fixture")}}',
      compatibilityDate: '2026-08-18',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  for (const name of [
    '0009_sad_giant_girl.sql',
    '0012_marketplace_relation_guards.sql',
  ]) {
    const migration = readFileSync(
      new URL(`../drizzle/${name}`, import.meta.url),
      'utf8',
    );
    for (const statement of migration
      .split('--> statement-breakpoint')
      .filter((value) => value.trim()))
      await db.prepare(statement).run();
  }

  const alice = everythingMarketStore(db, 'alice');
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const input = {
    assetId: 'rock:research-brief',
    side: 'buy',
    priceMinor: 2200,
    quantity: 2,
    mode: 'PAPER',
    expiresAt,
  };
  const proposed = await alice.propose(input, 'proposal:fixed-one');
  assert.equal(proposed.status, 'PROPOSED');
  assert.equal(
    (await alice.propose(input, 'proposal:fixed-one')).id,
    proposed.id,
  );
  await assert.rejects(
    alice.propose({ ...input, quantity: 3 }, 'proposal:fixed-one'),
    /異なる提案/,
  );
  await assert.rejects(alice.approve(proposed.id, 'a'.repeat(64)), /同一内容/);
  const approved = await alice.approve(proposed.id, proposed.digest);
  assert.equal(approved.status, 'APPROVED');
  const executed = await alice.execute(proposed.id, 'execute:fixed-one');
  assert.equal(executed.status, 'EXECUTED');
  assert.match(executed.receiptId, /^paper:/);
  assert.equal((await alice.snapshot()).paperBalanceMinor, 95_600);
  assert.equal(
    (await everythingMarketStore(db, 'bob').snapshot()).proposals.length,
    0,
  );

  await assert.rejects(
    db
      .prepare(
        "INSERT INTO marketplace_approvals VALUES ('approval:forged',?,'bob',?,'APPROVED',?)",
      )
      .bind(proposed.id, proposed.digest, new Date().toISOString())
      .run(),
    /marketplace approval relation mismatch/,
  );
  await assert.rejects(
    db
      .prepare(
        "INSERT INTO marketplace_receipts VALUES ('proposal:missing','paper:forged','alice','execute:forged','{}',?)",
      )
      .bind(new Date().toISOString())
      .run(),
    /marketplace receipt relation mismatch/,
  );
  await assert.rejects(
    db
      .prepare(
        'UPDATE marketplace_reservations SET user_id=? WHERE proposal_id=?',
      )
      .bind('bob', proposed.id)
      .run(),
    /marketplace reservation binding immutable/,
  );
  await assert.rejects(
    db
      .prepare('DELETE FROM marketplace_positions WHERE proposal_id=?')
      .bind(proposed.id)
      .run(),
    /marketplace position immutable/,
  );
});
