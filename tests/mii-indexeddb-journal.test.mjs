import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMiiIndexedDbJournal } from '../lib/mii-indexeddb-journal.ts';

const record = { schema: 'rockstaros.mii-plan-cancel/1', ownerScope: 'owner-v1:' + 'a'.repeat(64),
  jobId: '11111111-1111-4111-8111-111111111111', revision: 2,
  commandId: '22222222-2222-4222-8222-222222222222' };

void test('unsupported host fails closed without asking for persistent storage permission', async () => {
  assert.equal(typeof globalThis.indexedDB, 'undefined');
  await assert.rejects(createMiiIndexedDbJournal().claim(record), /MII_DURABLE_STORAGE_UNAVAILABLE/);
});

void test('reject malformed owner, IDs and extra fields before storage access', async () => {
  const journal = createMiiIndexedDbJournal();
  for (const value of [{ ...record, ownerScope: 'attacker' }, { ...record, commandId: 'bad' },
    { ...record, secret: 'not-allowed' }, { ...record, revision: -1 }])
    await assert.rejects(journal.claim(value), /MII_JOURNAL_RECORD_INVALID/);
});

// Optional integration against a real, isolated Chrome profile. CI machines may
// not have a browser: set MII_CHROME_BINARY to run this test where available.
void test('real browser strict transactions and reload with a simulated persistent-storage grant',
  { timeout: 60_000 }, async t => {
    const binary = process.env.MII_CHROME_BINARY;
    if (!binary) return t.skip('Set MII_CHROME_BINARY for the isolated real-browser test');
    const { build } = await import('esbuild');
    const bundle = await build({ entryPoints: [new URL('../lib/mii-indexeddb-journal.ts', import.meta.url).pathname],
      bundle: true, platform: 'browser', format: 'iife', globalName: 'MiiJournal', write: false });
    const javascript = bundle.outputFiles[0].text;
    const page = `<!doctype html><meta charset="utf-8"><body>WAITING<script src="/bundle.js"></script><script>
    (async () => {
      const assert = (condition, message) => { if (!condition) throw Error(message); };
      const record = ${JSON.stringify(record)};
      const journal = MiiJournal.createMiiIndexedDbJournal();
      const phase = new URL(location.href).searchParams.get('phase');
      if (!(await navigator.storage.persisted())) {
        let refused = false;
        try { await journal.read(record); } catch (e) { refused = e.message === 'MII_DURABLE_STORAGE_UNAVAILABLE'; }
        assert(refused, 'actual non-persistent host must be refused');
      }
      // Headless Chrome does not grant persistent storage. Simulate only this
      // permission result; the IndexedDB engine and restart remain real.
      Object.defineProperty(navigator.storage, 'persisted', {value: async () => true, configurable: true, writable: true});
      if (phase === 'one') {
        const other = {...record, commandId: '33333333-3333-4333-8333-333333333333'};
        const claims = await Promise.all([journal.claim(record), journal.claim(other)]);
        assert(claims.filter(x => x === 'claimed').length === 1, 'one claim must win');
        assert(claims.filter(x => x === 'occupied').length === 1, 'second claim must be occupied');
        const winner = await journal.read(record);
        const loser = winner.commandId === record.commandId ? other : record;
        assert(!(await journal.settle(loser)), 'wrong command must not settle');
        assert((await journal.read(record)).commandId === winner.commandId, 'winner must remain');
        assert((await journal.read({...record, ownerScope:'owner-v1:'+'b'.repeat(64)})) === null, 'owners must be isolated');
        const persisted = navigator.storage.persisted.bind(navigator.storage);
        navigator.storage.persisted = async () => false;
        let unavailable = false;
        try { await journal.read(record); } catch (e) { unavailable = e.message === 'MII_DURABLE_STORAGE_UNAVAILABLE'; }
        navigator.storage.persisted = persisted;
        assert(unavailable, 'non-persistent storage must fail closed');
        const oldTransaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function(...args) {
          const tx = oldTransaction.apply(this, args);
          Object.defineProperty(tx, 'durability', {value: 'relaxed'});
          return tx;
        };
        let strictDenied = false;
        try { await journal.read(record); } catch (e) { strictDenied = e.message === 'MII_STRICT_DURABILITY_UNAVAILABLE'; }
        IDBDatabase.prototype.transaction = oldTransaction;
        assert(strictDenied, 'strict durability fallback must be rejected');
        await fetch('/done?result=' + encodeURIComponent('PASS one'));
      } else {
        const saved = await journal.read(record);
        assert(saved && saved.jobId === record.jobId && saved.revision === record.revision, 'claim lost after restart');
        assert(await journal.settle(saved), 'exact claim must settle');
        assert((await journal.read(record)) === null, 'settled claim must be removed');
        await fetch('/done?result=' + encodeURIComponent('PASS two'));
      }
    })().catch(e => { void fetch('/done?result=' + encodeURIComponent('FAIL ' + e.message)); });</script>`;
    let report = null;
    const server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(javascript); }
      else if (req.url.startsWith('/done?')) {
        const value = new URL(req.url, 'http://127.0.0.1').searchParams.get('result');
        res.end('ok'); if (report) report(value);
      }
      else { res.setHeader('Content-Type', 'text/html'); res.end(page); }
    });
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const profile = await mkdtemp(join(tmpdir(), 'mii-browser-fixture-'));
    t.after(() => rm(profile, { recursive: true, force: true }));
    const port = server.address().port;
    const run = phase => new Promise((resolve, reject) => {
      const child = spawn(binary, ['--headless=new', '--disable-gpu', '--disable-background-networking',
        '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
        '--remote-debugging-port=0', `http://127.0.0.1:${port}/?phase=${phase}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '', outcome = null;
      child.stderr.on('data', chunk => { if (stderr.length < 4000) stderr += chunk; });
      child.once('error', reject);
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('browser integration timed out')); }, 20_000);
      report = value => { outcome = value; child.kill('SIGTERM'); };
      child.once('close', code => {
        clearTimeout(timer); report = null;
        if (outcome !== null) resolve(outcome);
        else reject(new Error(`browser exit ${code}: ${stderr.slice(-500)}`));
      });
    });
    assert.equal(await run('one'), 'PASS one');
    assert.equal(await run('two'), 'PASS two');
  });
