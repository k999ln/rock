import {
  constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds lib/generated/private-content.ts from the files under private/.
// Encryption is off since 2026-10-11, so the real content is always used. If the
// files are ever git-crypt ciphertext again (encryption re-enabled, no key), safe
// placeholders are used so the app still builds. The generated file is git-ignored.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'lib/generated/private-content.ts');
const GIT_CRYPT_HEADER = Buffer.from('\0GITCRYPT\0');

function trustedDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== resolve(path))
    throw new Error('private content: generated directory must be a real directory');
  return stat;
}

// The build workspace's parent must be trusted and stable. Replacement publishes
// the directory entry atomically: it never opens the destination for writing.
export function writeGeneratedContent(path, text) {
  const directory = dirname(path);
  const parent = trustedDirectory(directory);
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1)
      throw new Error('private content: generated output must be a regular, unlinked file');
    if (readFileSync(fd, 'utf8') === text) {
      const currentFile = lstatSync(path);
      const currentParent = trustedDirectory(directory);
      if (!currentFile.isFile() || currentFile.nlink !== 1 ||
          currentFile.dev !== stat.dev || currentFile.ino !== stat.ino ||
          currentParent.dev !== parent.dev || currentParent.ino !== parent.ino)
        throw new Error('private content: generated output changed during the build');
      return false;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const temporary = resolve(directory, `.private-content-${randomUUID()}.tmp`);
  let temporaryCreated = false;
  let output;
  try {
    output = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    temporaryCreated = true;
    writeFileSync(output, text);
    closeSync(output);
    output = undefined;
    const current = trustedDirectory(directory);
    if (parent.dev !== current.dev || parent.ino !== current.ino)
      throw new Error('private content: generated directory changed during the build');
    renameSync(temporary, path);
    temporaryCreated = false;
    return true;
  } finally {
    if (output !== undefined) closeSync(output);
    if (temporaryCreated) unlinkSync(temporary);
  }
}

export function isLocked(bytes) {
  return bytes.subarray(0, GIT_CRYPT_HEADER.length).equals(GIT_CRYPT_HEADER);
}

function readPrivateJson(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) return { state: 'missing', value: null };
  const bytes = readFileSync(path);
  if (isLocked(bytes)) return { state: 'locked', value: null };
  return { state: 'available', value: JSON.parse(bytes.toString('utf8')) };
}

function stringList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((line) => typeof line !== 'string' || !line.trim()))
    throw new Error(`${label}: instructions must be a non-empty string array`);
  return value;
}

const PUBLIC_PATENT_AI = [
  '先行技術調査の補助です。特許性・侵害回避・登録・期限は保証しません。',
  '必ずweb_searchを使い、許可された一次情報だけを根拠にしてください。公開番号・名称・URLを推測しないでください。',
  '日本語で、確認できたことと確認できなかったことを分けて回答してください。',
];
const PUBLIC_LEGAL_AI = [
  '日本語の法律情報ナビゲーターです。弁護士ではなく、個別の法的助言・期限計算・代理はしません。',
  '必ずweb_searchを使い、許可された政府・裁判所の一次情報だけを根拠にしてください。',
  '差し迫った危険がある場合は911を優先するよう案内してください。',
];

function lawyerEntries(value) {
  if (!value || !Array.isArray(value.entries)) throw new Error('lawyer-directory: entries must be an array');
  for (const entry of value.entries) {
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || !Array.isArray(entry.categories) || !Array.isArray(entry.regions) || typeof entry.focus !== 'string')
      throw new Error(`lawyer-directory: invalid entry ${entry?.id ?? '?'}`);
  }
  return value.entries;
}

export function buildPrivateContent() {
  const patent = readPrivateJson('private/prompts/patent-ai.json');
  const legal = readPrivateJson('private/prompts/legal-ai.json');
  const lawyers = readPrivateJson('private/legal/lawyer-directory.json');
  const available = {
    patentAi: patent.state === 'available',
    legalAi: legal.state === 'available',
    lawyerDirectory: lawyers.state === 'available',
  };
  const content = {
    available,
    patentAi: available.patentAi ? stringList(patent.value.instructions, 'patent-ai') : PUBLIC_PATENT_AI,
    legalAi: available.legalAi ? stringList(legal.value.instructions, 'legal-ai') : PUBLIC_LEGAL_AI,
    lawyerAsOf: available.lawyerDirectory ? String(lawyers.value.asOf ?? '') : '',
    lawyers: available.lawyerDirectory ? lawyerEntries(lawyers.value) : [],
  };
  const text = [
    '// Generated by scripts/generate-private-modules.mjs. Do not edit and never commit this file.',
    "import type { LawyerDirectoryEntry } from '../legal-intake.ts';",
    '',
    `export const PRIVATE_CONTENT_AVAILABLE = ${JSON.stringify(content.available)} as const;`,
    `export const PATENT_AI_INSTRUCTIONS: readonly string[] = ${JSON.stringify(content.patentAi, null, 2)};`,
    `export const LEGAL_AI_INSTRUCTIONS: readonly string[] = ${JSON.stringify(content.legalAi, null, 2)};`,
    `export const LAWYER_DIRECTORY_AS_OF: string = ${JSON.stringify(content.lawyerAsOf)};`,
    `export const LAWYER_DIRECTORY: readonly LawyerDirectoryEntry[] = ${JSON.stringify(content.lawyers, null, 2)} as LawyerDirectoryEntry[];`,
    '',
  ].join('\n');
  return { text, available };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { text, available } = buildPrivateContent();
  trustedDirectory(resolve(root, 'lib'));
  try {
    mkdirSync(dirname(outputPath), { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  writeGeneratedContent(outputPath, text);
  const missing = Object.entries(available).filter(([, ok]) => !ok).map(([name]) => name);
  console.log(
    missing.length
      ? `private content: public placeholders for ${missing.join(', ')} (encrypted or missing)`
      : 'private content: unlocked',
  );
}
