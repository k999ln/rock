import { constants } from 'node:fs';
import { mkdir, lstat, open, readdir, rename, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { userInfo } from 'node:os';
import { randomUUID } from 'node:crypto';

export class HostProfileError extends Error {
  constructor(code) {
    super(code);
    this.name = 'HostProfileError';
    this.code = code;
  }
}
export const hostAssert = (value, code) => {
  if (!value) throw new HostProfileError(code);
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function readPrivateHostFile(path, maximum = 100000) {
  const a = await lstat(path);
  hostAssert(a.isFile() && !a.isSymbolicLink(), 'PRIVATE_HOST_FILE_REQUIRED');
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const s = await file.stat();
    hostAssert(
      s.isFile() &&
        s.uid === userInfo().uid &&
        (s.mode & 0o077) === 0 &&
        s.nlink === 1 &&
        s.size <= maximum,
      'PRIVATE_HOST_FILE_REQUIRED',
    );
    return JSON.parse(await file.readFile('utf8'));
  } finally {
    await file.close();
  }
}
async function privateDirectory(path, create) {
  hostAssert(
    ['darwin', 'linux'].includes(process.platform),
    'UNSUPPORTED_HOST_PLATFORM',
  );
  const root = resolve(path);
  for (let p = root; ; p = dirname(p)) {
    try {
      await lstat(join(p, '.git'));
      throw new HostProfileError('HOST_STATE_MUST_BE_OUTSIDE_REPOSITORY');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (dirname(p) === p) break;
  }
  if (create)
    try {
      await mkdir(root, { mode: 0o700, recursive: true });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  const s = await lstat(root);
  hostAssert(
    s.isDirectory() &&
      !s.isSymbolicLink() &&
      s.uid === userInfo().uid &&
      (s.mode & 0o077) === 0,
    'PRIVATE_HOST_DIRECTORY_REQUIRED',
  );
  return root;
}
function validate(v) {
  hostAssert(
    v &&
      Object.keys(v).sort().join(',') ===
        'configuration,origin,profileId,schema,status' &&
      v.schema === 'rockstaros.node-host-profile/1' &&
      uuid.test(v.profileId) &&
      ['prepared', 'pending', 'linked', 'uncertain'].includes(v.status),
    'INVALID_HOST_PROFILE',
  );
  return v;
}
/** Local configuration lock only. An existing lock is never proof that its process is live or dead. */
export async function openHostProfile(
  directory,
  { create, readOnly = false } = {},
) {
  const root = await privateDirectory(directory, Boolean(create)),
    path = join(root, 'host.json');
  let lock,
    closed = false,
    snapshot;
  if (!readOnly) {
    try {
      lock = await open(
        join(root, 'host.lock'),
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch (e) {
      if (e.code === 'EEXIST')
        throw new HostProfileError('HOST_STATE_IN_USE_OR_UNCLEAN');
      throw e;
    }
  }
  const close = async () => {
    if (closed) return;
    closed = true;
    if (lock) {
      const own = await lock.stat();
      await lock.close();
      const current = await lstat(join(root, 'host.lock'));
      hostAssert(
        current.ino === own.ino && current.dev === own.dev,
        'HOST_LOCK_CHANGED',
      );
      await unlink(join(root, 'host.lock'));
    }
  };
  try {
    if (lock) {
      await lock.writeFile(
        JSON.stringify({
          schema: 1,
          pid: process.pid,
          nonce: randomUUID(),
          uid: userInfo().uid,
        }),
      );
      await lock.sync();
    }
    try {
      snapshot = validate(await readPrivateHostFile(path));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const commit = async (next) => {
      hostAssert(lock && !closed, 'HOST_PROFILE_READ_ONLY');
      validate(next);
      if (snapshot) {
        const current = await readPrivateHostFile(path);
        hostAssert(
          JSON.stringify(current) === JSON.stringify(snapshot),
          'HOST_PROFILE_CHANGED',
        );
        hostAssert(
          next.profileId === snapshot.profileId &&
            next.origin === snapshot.origin &&
            JSON.stringify(next.configuration) ===
              JSON.stringify(snapshot.configuration),
          'HOST_PROFILE_BINDING_CHANGED',
        );
      } else
        hostAssert(
          (await readdir(root)).every((n) => n === 'host.lock'),
          'HOST_STATE_NOT_EMPTY',
        );
      const temporary = join(root, `.host-${randomUUID()}.tmp`);
      const fd = await open(
        temporary,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await fd.writeFile(JSON.stringify(next) + '\n');
        await fd.sync();
      } finally {
        await fd.close();
      }
      try {
        await rename(temporary, path);
        const dir = await open(
          root,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        try {
          await dir.sync();
        } finally {
          await dir.close();
        }
      } finally {
        await unlink(temporary).catch(() => {});
      }
      snapshot = structuredClone(next);
      return snapshot;
    };
    if (create) {
      hostAssert(!snapshot, 'HOST_PROFILE_ALREADY_EXISTS');
      await commit({
        schema: 'rockstaros.node-host-profile/1',
        profileId: randomUUID(),
        origin: create.origin,
        configuration: create.configuration,
        status: 'prepared',
      });
    }
    hostAssert(snapshot, 'HOST_PROFILE_MISSING');
    return {
      directory: root,
      get value() {
        return structuredClone(snapshot);
      },
      commit,
      close,
    };
  } catch (e) {
    await close();
    throw e;
  }
}
