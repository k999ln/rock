import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  stat,
  chmod,
  symlink,
  mkdir,
} from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  saveNodeHostCredentials as save,
  loadNodeHostCredentials as load,
} from '../src/credential-vault.mjs';
const phrase = () => Buffer.from('Synthetic local unlock phrase only.');
const scope = async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rock-vault-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    dir: join(root, 'private'),
    id: randomUUID(),
    value: {
      origin: 'https://fixture.invalid',
      owner: 'synthetic-owner',
      deviceId: randomUUID(),
      accessToken: 'rock_session_' + 'x'.repeat(43),
      expiresAt: Date.now() + 600000,
    },
  };
};
void test('credentials are authenticated ciphertext at rest, with private modes and explicit unlock', async (t) => {
  const f = await scope(t),
    p = phrase();
  await save(f.dir, f.id, f.value, p);
  const raw = await readFile(join(f.dir, f.id + '.vault'), 'utf8');
  assert.doesNotMatch(raw, /rock_session_|synthetic-owner/);
  assert.equal((await stat(f.dir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(f.dir, f.id + '.vault'))).mode & 0o777, 0o600);
  assert.deepEqual(await load(f.dir, f.id, p), f.value);
  assert.equal(p.toString(), 'Synthetic local unlock phrase only.');
});
void test('wrong unlock phrase and modified ciphertext fail without returning credentials', async (t) => {
  const f = await scope(t);
  await save(f.dir, f.id, f.value, phrase());
  await assert.rejects(
    load(f.dir, f.id, Buffer.from('A different synthetic unlock phrase')),
    { code: 'CREDENTIAL_UNLOCK_FAILED' },
  );
  const path = join(f.dir, f.id + '.vault'),
    v = JSON.parse(await readFile(path, 'utf8'));
  const bytes = Buffer.from(v.ciphertext, 'base64');
  bytes[0] ^= 1;
  v.ciphertext = bytes.toString('base64');
  await writeFile(path, JSON.stringify(v));
  await assert.rejects(load(f.dir, f.id, phrase()), {
    code: 'CREDENTIAL_UNLOCK_FAILED',
  });
});
void test('profile, UID and KDF binding cannot be changed or used for unbounded KDF work', async (t) => {
  const f = await scope(t);
  await save(f.dir, f.id, f.value, phrase());
  const path = join(f.dir, f.id + '.vault'),
    original = JSON.parse(await readFile(path, 'utf8'));
  for (const patch of [
    { profileId: randomUUID() },
    { localUid: userInfo().uid + 1 },
    { kdf: 'scrypt-N1073741824-r8-p1' },
  ]) {
    await writeFile(path, JSON.stringify({ ...original, ...patch }));
    await assert.rejects(load(f.dir, f.id, phrase()), {
      code: 'CREDENTIAL_BINDING_MISMATCH',
    });
  }
});
void test('existing or concurrently created profiles are never overwritten', async (t) => {
  const f = await scope(t);
  await mkdir(f.dir, { mode: 0o700 });
  const results = await Promise.allSettled([
    save(f.dir, f.id, f.value, phrase()),
    save(
      f.dir,
      f.id,
      { ...f.value, accessToken: 'rock_session_' + 'y'.repeat(43) },
      phrase(),
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.code,
    'CREDENTIAL_PROFILE_ALREADY_EXISTS',
  );
  const stored = await load(f.dir, f.id, phrase());
  await assert.rejects(save(f.dir, f.id, f.value, phrase()), {
    code: 'CREDENTIAL_PROFILE_ALREADY_EXISTS',
  });
  assert.deepEqual(await load(f.dir, f.id, phrase()), stored);
});
void test('symlink directories, symlink files and broad file modes are rejected', async (t) => {
  const f = await scope(t);
  await save(f.dir, f.id, f.value, phrase());
  const alias = join(f.root, 'alias');
  await symlink(f.dir, alias);
  await assert.rejects(load(alias, f.id, phrase()), {
    code: 'PRIVATE_CREDENTIAL_DIRECTORY_REQUIRED',
  });
  const second = randomUUID();
  await symlink(join(f.dir, f.id + '.vault'), join(f.dir, second + '.vault'));
  await assert.rejects(load(f.dir, second, phrase()), {
    code: 'PRIVATE_CREDENTIAL_FILE_REQUIRED',
  });
  await chmod(join(f.dir, f.id + '.vault'), 0o644);
  await assert.rejects(load(f.dir, f.id, phrase()), {
    code: 'PRIVATE_CREDENTIAL_FILE_REQUIRED',
  });
});
void test('expired credentials remain encrypted but cannot authorize a resumed host', async (t) => {
  const f = await scope(t);
  await save(f.dir, f.id, { ...f.value, expiresAt: Date.now() - 1 }, phrase());
  await assert.rejects(load(f.dir, f.id, phrase()), {
    code: 'HOST_CREDENTIAL_EXPIRED',
  });
});
void test('invalid profile, origin and weak or invalid unlock input are rejected', async (t) => {
  const f = await scope(t);
  await assert.rejects(save(f.dir, '../outside', f.value, phrase()), {
    code: 'INVALID_CREDENTIAL_PROFILE',
  });
  await assert.rejects(
    save(f.dir, f.id, { ...f.value, origin: 'not-a-url' }, phrase()),
    { code: 'INVALID_HOST_ORIGIN' },
  );
  for (const p of [
    Buffer.from('short'),
    Buffer.from('long enough but\ninvalid'),
    Buffer.from([255, ...Buffer.from('not valid utf8 phrase')]),
  ])
    await assert.rejects(save(f.dir, f.id, f.value, p), {
      code: 'LOCAL_UNLOCK_PHRASE_REQUIRED',
    });
});
