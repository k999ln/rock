import { constants } from 'node:fs';
import { mkdir, lstat, open, link, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { userInfo } from 'node:os';
import {
  randomBytes,
  randomUUID,
  scrypt,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt),
  schema = 'rockstaros.host-credential-vault/1';
const kdf = 'scrypt-N32768-r8-p1',
  fields = (v, n) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === n.length &&
    n.every((k) => Object.hasOwn(v, k));
const uuid = (v) =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export class CredentialVaultError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CredentialVaultError';
    this.code = code;
  }
}
const requireValue = (v, code) => {
  if (!v) throw new CredentialVaultError(code);
};
function credential(v) {
  requireValue(
    fields(v, ['origin', 'owner', 'deviceId', 'accessToken', 'expiresAt']),
    'INVALID_HOST_CREDENTIALS',
  );
  requireValue(
    typeof v.origin === 'string' && v.origin.length <= 2048,
    'INVALID_HOST_ORIGIN',
  );
  let origin;
  try {
    origin = new URL(v.origin);
  } catch {
    throw new CredentialVaultError('INVALID_HOST_ORIGIN');
  }
  requireValue(
    v.origin === origin.origin &&
      (origin.protocol === 'https:' ||
        (origin.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))),
    'INVALID_HOST_ORIGIN',
  );
  requireValue(
    typeof v.owner === 'string' &&
      /^[A-Za-z0-9._:-]{1,160}$/.test(v.owner) &&
      uuid(v.deviceId) &&
      /^rock_session_[A-Za-z0-9_-]{43}$/.test(v.accessToken) &&
      Number.isSafeInteger(v.expiresAt) &&
      v.expiresAt > 0,
    'INVALID_HOST_CREDENTIALS',
  );
  return v;
}
function password(value) {
  requireValue(
    value instanceof Uint8Array &&
      value.byteLength >= 15 &&
      value.byteLength <= 1024,
    'LOCAL_UNLOCK_PHRASE_REQUIRED',
  );
  const copy = Buffer.from(value);
  let chars;
  try {
    chars = new TextDecoder('utf-8', { fatal: true }).decode(copy);
    requireValue(
      Array.from(chars).length >= 15 &&
        Array.from(chars).every(
          (c) => c.codePointAt(0) >= 32 && c.codePointAt(0) !== 127,
        ),
      'LOCAL_UNLOCK_PHRASE_REQUIRED',
    );
  } catch (e) {
    copy.fill(0);
    throw e instanceof CredentialVaultError
      ? e
      : new CredentialVaultError('LOCAL_UNLOCK_PHRASE_REQUIRED');
  }
  return copy;
}
export function validateNodeUnlockPhrase(value) {
  const copy=password(value);copy.fill(0);return true;
}
async function directory(path, create = false) {
  requireValue(
    ['darwin', 'linux'].includes(process.platform) &&
      Number.isSafeInteger(userInfo().uid) &&
      userInfo().uid >= 0,
    'UNSUPPORTED_CREDENTIAL_STORE',
  );
  const root = resolve(path);
  if (create)
    try {
      await mkdir(root, { mode: 0o700 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  const info = await lstat(root);
  requireValue(
    info.isDirectory() &&
      !info.isSymbolicLink() &&
      info.uid === userInfo().uid &&
      (info.mode & 0o077) === 0,
    'PRIVATE_CREDENTIAL_DIRECTORY_REQUIRED',
  );
  return root;
}
const decode = (v, size) => {
  requireValue(
    typeof v === 'string' && v.length <= 16000,
    'INVALID_CREDENTIAL_ENVELOPE',
  );
  const b = Buffer.from(v, 'base64');
  requireValue(
    b.toString('base64') === v && (size === undefined || b.length === size),
    'INVALID_CREDENTIAL_ENVELOPE',
  );
  return b;
};
function header(profileId) {
  requireValue(uuid(profileId), 'INVALID_CREDENTIAL_PROFILE');
  return { schema, profileId, localUid: userInfo().uid, kdf };
}
async function readEnvelope(path) {
  const before = await lstat(path);
  requireValue(
    before.isFile() && !before.isSymbolicLink(),
    'PRIVATE_CREDENTIAL_FILE_REQUIRED',
  );
  const fd = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await fd.stat();
    requireValue(
      info.isFile() &&
        info.uid === userInfo().uid &&
        (info.mode & 0o077) === 0 &&
        info.nlink === 1 &&
        info.size <= 20000,
      'PRIVATE_CREDENTIAL_FILE_REQUIRED',
    );
    return JSON.parse(await fd.readFile('utf8'));
  } finally {
    await fd.close();
  }
}
/** Software encryption at rest, with explicit per-process unlock. Not an OS biometric vault. */
export async function saveNodeHostCredentials(path, profileId, value, phrase) {
  const data = credential(value),
    meta = header(profileId),
    root = await directory(path, true),
    secret = password(phrase),
    salt = randomBytes(32),
    nonce = randomBytes(12);
  let key, plain, temp, fd;
  try {
    key = await derive(secret, salt, 32, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    plain = Buffer.from(JSON.stringify(data));
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify(meta)));
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const payload = {
      ...meta,
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
    temp = join(root, `.credential-${randomUUID()}.tmp`);
    fd = await open(
      temp,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    await fd.writeFile(JSON.stringify(payload) + '\n');
    await fd.sync();
    await fd.close();
    fd = null;
    // Publish without replacing any existing profile, including during concurrent setup.
    await link(temp, join(root, profileId + '.vault'));
    await unlink(temp);
    temp = null;
    const dir = await open(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
    return {
      profileId,
      stored: true,
      protection: 'software-encrypted-explicit-unlock',
    };
  } catch (e) {
    throw new CredentialVaultError(
      e.code === 'EEXIST'
        ? 'CREDENTIAL_PROFILE_ALREADY_EXISTS'
        : e instanceof CredentialVaultError
          ? e.code
          : 'CREDENTIAL_SAVE_UNCONFIRMED',
    );
  } finally {
    secret.fill(0);
    key?.fill(0);
    plain?.fill(0);
    await fd?.close();
    if (temp) await unlink(temp).catch(() => {});
  }
}
export async function loadNodeHostCredentials(path, profileId, phrase) {
  const root = await directory(path),
    meta = header(profileId),
    secret = password(phrase);
  let key, plain;
  try {
    const v = await readEnvelope(join(root, profileId + '.vault'));
    requireValue(
      fields(v, [
        'schema',
        'profileId',
        'localUid',
        'kdf',
        'salt',
        'nonce',
        'ciphertext',
        'tag',
      ]) &&
        JSON.stringify({
          schema: v.schema,
          profileId: v.profileId,
          localUid: v.localUid,
          kdf: v.kdf,
        }) === JSON.stringify(meta),
      'CREDENTIAL_BINDING_MISMATCH',
    );
    key = await derive(secret, decode(v.salt, 32), 32, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const decipher = createDecipheriv('aes-256-gcm', key, decode(v.nonce, 12));
    decipher.setAAD(Buffer.from(JSON.stringify(meta)));
    decipher.setAuthTag(decode(v.tag, 16));
    plain = Buffer.concat([
      decipher.update(decode(v.ciphertext)),
      decipher.final(),
    ]);
    const result = credential(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)),
    );
    requireValue(result.expiresAt > Date.now(), 'HOST_CREDENTIAL_EXPIRED');
    return result;
  } catch (e) {
    throw e instanceof CredentialVaultError
      ? e
      : new CredentialVaultError('CREDENTIAL_UNLOCK_FAILED');
  } finally {
    secret.fill(0);
    key?.fill(0);
    plain?.fill(0);
  }
}
