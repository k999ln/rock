import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  actionInput,
  targetUrl,
  jobStore,
  stageFile,
  readArtifact,
} from '../toolkits/noah-coconala/jobs.mjs';

const reply = () => ({
  requestId: randomUUID(),
  target: '100',
  message: '承知しました。',
});
const rejectCall = () => assert.fail('unexpected dispatch');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'noah-coconala-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await jobStore(root);
  t.after(() => store.close());
  return { root, store };
}
await test('only fixed Coconala paths, dates and file names reach the browser', () => {
  const args = reply();
  for (const bad of [
    { target: 'https://elsewhere.invalid/' },
    { target: '10/1' },
    { url: 'https://example.org' },
    { message: '   ' },
  ]) {
    assert.throws(() => actionInput('reply', { ...args, ...bad }));
  }
  assert.equal(
    targetUrl(actionInput('room_reply', args)),
    'https://coconala.com/talkrooms/100',
  );
  assert.throws(() =>
    actionInput('apply', { ...args, price: 55, due: '2027-02-30' }),
  );
  assert.throws(() =>
    actionInput('deliver', {
      ...args,
      filename: '../file',
      sha256: 'a'.repeat(64),
    }),
  );
});
await test('send is reserved once, duplicate receipts survive restart, changed approval is refused', async (t) => {
  const { root, store } = await fixture(t);
  const args = reply(),
    job = actionInput('reply', args);
  let release;
  const gate = new Promise((done) => {
    release = done;
  });
  const sent = store.run(args.requestId, job, async (_, begin) => {
    begin();
    await gate;
  });
  const second = await jobStore(root);
  t.after(() => second.close());
  second.recover();
  const alias = randomUUID();
  assert.equal((await second.run(alias, job, rejectCall)).state, 'sending');
  await assert.rejects(
    second.run(args.requestId, { ...job, message: '変更' }, rejectCall),
  );
  await assert.rejects(
    second.run(randomUUID(), { ...job, target: '200' }, rejectCall),
  );
  release();
  assert.equal((await sent).state, 'completed');
  assert.equal(second.status(alias).state, 'completed');
  assert.equal(
    (await second.run(randomUUID(), job, rejectCall)).state,
    'completed',
  );
});
await test('failure before sending can retry; uncertain outcome fences changed content for the same target', async (t) => {
  const { store } = await fixture(t);
  const args = reply(),
    job = actionInput('reply', args);
  assert.equal(
    (
      await store.run(args.requestId, job, async () => {
        throw Error('login');
      })
    ).state,
    'blocked',
  );
  assert.equal(
    (
      await store.run(args.requestId, job, async (_, begin) => {
        begin();
        throw Error('lost acknowledgement');
      })
    ).state,
    'unknown',
  );
  assert.equal(
    (await store.run(randomUUID(), job, rejectCall)).state,
    'unknown',
  );
  await assert.rejects(
    store.run(randomUUID(), { ...job, message: '変更' }, rejectCall),
    /未確認/,
  );
});
await test('formal delivery uses exactly the selected bytes and never follows file aliases', async (t) => {
  const { root } = await fixture(t);
  const path = join(root, '添付.txt');
  await writeFile(path, '選択した内容');
  await symlink(path, join(root, 'alias'));
  await assert.rejects(stageFile(root, join(root, 'alias')));
  const artifact = await stageFile(root, path);
  const job = actionInput('deliver', { ...reply(), ...artifact });
  assert.equal(
    (await readArtifact(root, job)).buffer.toString(),
    '選択した内容',
  );
  await writeFile(join(root, 'files', artifact.sha256), '内容変更');
  await assert.rejects(readArtifact(root, job), /変更/);
});

await test('本人が結果不明を照合しても送信しない。未送信の訂正後だけ新しい承認が使える', async (t) => {
  const { store } = await fixture(t);
  const args = reply(),
    job = actionInput('reply', args);
  const lost = async (_, begin) => {
    begin();
    throw Error('lost');
  };
  await store.run(args.requestId, job, lost);
  assert.equal(store.reconcile(args.requestId, 'not-sent').state, 'blocked');
  await store.run(args.requestId, job, lost);
  assert.equal(
    store.reconcile(args.requestId, 'sent').state,
    'owner_confirmed',
  );
  assert.equal(
    (await store.run(randomUUID(), job, rejectCall)).state,
    'owner_confirmed',
  );
  assert.throws(() => store.reconcile(args.requestId, 'not-sent'));
});
