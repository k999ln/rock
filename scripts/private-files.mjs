import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Helpers for the git-crypt encrypted areas listed in .gitattributes.
//   node scripts/private-files.mjs status   how many encrypted files, and whether they are readable
//   node scripts/private-files.mjs check    fail if a file that must be encrypted is stored in plain text
//   node scripts/private-files.mjs unlock   unlock with the base64 key in ROCK_GIT_CRYPT_KEY
//   node scripts/private-files.mjs require-unlocked   stop before updating unreadable private records

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEADER = Buffer.from('\0GITCRYPT\0');

function git(args, input) {
  const result = spawnSync('git', args, { cwd: root, input, maxBuffer: 1 << 30 });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

function nulList(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

/** Tracked paths whose .gitattributes filter is git-crypt. */
export function encryptedPaths() {
  const tracked = nulList(git(['ls-files', '-z']));
  if (!tracked.length) return [];
  const out = nulList(git(['check-attr', '-z', '--stdin', 'filter'], tracked.join('\0') + '\0'));
  const paths = [];
  for (let i = 0; i + 2 < out.length; i += 3)
    if (out[i + 1] === 'filter' && out[i + 2] === 'git-crypt') paths.push(out[i]);
  return paths;
}

export function isLockedBytes(bytes) {
  return bytes.subarray(0, HEADER.length).equals(HEADER);
}

/** Encrypted paths whose working-tree copy is still ciphertext. */
export function lockedPaths(paths = encryptedPaths()) {
  return paths.filter((path) => {
    try {
      return isLockedBytes(readFileSync(resolve(root, path)));
    } catch {
      return false;
    }
  });
}

export function isUnlocked() {
  return lockedPaths().length === 0;
}

/** Stored blobs (index and HEAD) that should be encrypted but are plain text. */
export function plaintextLeaks(paths = encryptedPaths()) {
  const leaks = [];
  for (const ref of [':', 'HEAD:']) {
    if (ref === 'HEAD:' && spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: root }).status !== 0)
      continue;
    const spec = paths.map((path) => `${ref}${path}`).join('\n') + '\n';
    const batch = git(['cat-file', '--batch'], spec);
    let offset = 0;
    for (const path of paths) {
      const lineEnd = batch.indexOf(0x0a, offset);
      const header = batch.subarray(offset, lineEnd).toString('utf8');
      offset = lineEnd + 1;
      if (header.endsWith(' missing')) continue;
      const size = Number(header.split(' ')[2]);
      const blob = batch.subarray(offset, offset + size);
      offset += size + 1;
      if (size > 0 && !isLockedBytes(blob)) leaks.push(`${ref === ':' ? 'index' : 'HEAD'}: ${path}`);
    }
  }
  return leaks;
}

function trackedGenerated() {
  return nulList(git(['ls-files', '-z', '--', 'lib/generated']));
}

function main(command = 'status') {
  if (command === 'require-unlocked') {
    if (!isUnlocked()) {
      console.error('Private records are locked. Unlock with git-crypt before updating or checking metadata.');
      return 1;
    }
    return 0;
  }
  if (command === 'status') {
    const paths = encryptedPaths();
    const locked = lockedPaths(paths);
    console.log(
      `encrypted files: ${paths.length} / readable here: ${paths.length - locked.length} / ` +
        (locked.length ? 'LOCKED (run git-crypt unlock to read them)' : 'unlocked'),
    );
    return 0;
  }
  if (command === 'check') {
    const leaks = plaintextLeaks();
    const generated = trackedGenerated();
    for (const leak of leaks) console.error(`plain text where encryption is required: ${leak}`);
    for (const path of generated) console.error(`generated private module must not be tracked: ${path}`);
    if (leaks.length || generated.length) {
      console.error('Do not push. Install git-crypt, unlock, then `git rm --cached` and re-add these files.');
      return 1;
    }
    console.log(`private files: all ${encryptedPaths().length} encrypted paths are stored encrypted`);
    return 0;
  }
  if (command === 'unlock') {
    const key = process.env.ROCK_GIT_CRYPT_KEY;
    if (!key) {
      console.error('ROCK_GIT_CRYPT_KEY (base64 of the git-crypt key file) is not set.');
      return 1;
    }
    const dir = mkdtempSync(join(tmpdir(), 'rock-key-'));
    const file = join(dir, 'key');
    try {
      writeFileSync(file, Buffer.from(key, 'base64'), { mode: 0o600 });
      const result = spawnSync('git-crypt', ['unlock', file], { cwd: root, stdio: 'inherit' });
      if (result.error) throw result.error;
      return result.status ?? 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  console.error('usage: node scripts/private-files.mjs status|check|unlock|require-unlocked');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main(process.argv[2]));
