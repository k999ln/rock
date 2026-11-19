import { createHash } from 'node:crypto';
import { readFile, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export const root = fileURLToPath(new URL('./', import.meta.url));
const packIds = ['article-editing', 'delivery-support', 'brand-operations'];
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

export async function verifyBundle() {
  const lock = await readJson(join(root, 'package-lock.json'));
  if (lock.schema !== 'noah.operation-pack-lock/1' || !lock.files || Object.keys(lock.files).length > 512)
    throw new Error('Invalid package lock');
  for (const [path, expected] of Object.entries(lock.files)) {
    if (!path || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid package path');
    let current = root;
    const segments = path.split('/');
    for (let i = 0; i < segments.length; i++) {
      current = join(current, segments[i]);
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || (i < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error(`Invalid package file: ${path}`);
    }
    const bytes = await readFile(current);
    if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256)
      throw new Error(`Package hash mismatch: ${path}`);
  }
  for (const path of ['index.json', 'noah.mjs', 'demo.mjs', ...packIds.map(id => `packs/${id}/manifest.json`)])
    if (!Object.hasOwn(lock.files, path)) throw new Error(`Missing locked entry: ${path}`);
  return { version: lock.version, files: Object.keys(lock.files).length };
}

function originValue(raw) {
  const url = new URL(raw);
  if (url.origin !== raw || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))))
    throw new Error('Use an exact HTTPS origin or localhost origin, without a path');
  return raw;
}

async function privateState(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid?.())
    throw new Error('State directory must be private and owned by the current user');
  for (const name of ['fashion.db', 'fashion.db-wal', 'fashion.db-shm']) {
    const file = await lstat(join(path, name)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (file && (!file.isFile() || file.isSymbolicLink() || file.uid !== stat.uid || (file.mode & 0o077)))
      throw new Error('Existing state file must be private and owned by the current user');
  }
}

export async function stopChildren(hub) {
  const children = [...hub.entries.values()].map(e => e.transport.process).filter(p => p && p.exitCode === null && p.signalCode === null);
  const stopped = children.map(child => new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Child stop unconfirmed; inspect this process before restarting')), 5000);
    child.once('exit', () => { clearTimeout(timer); done(); });
  }));
  hub.close();
  await Promise.all(stopped);
}

export async function startPack(id, { origin, port = 38479, stateDir } = {}) {
  if (!packIds.includes(id)) throw new Error('Unknown operation pack');
  origin = originValue(origin);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  await verifyBundle();
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node.js 22.13 or later is required');
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('This bundle supports macOS and Linux');
  if (id !== 'brand-operations') {
    const version = JSON.parse(execFileSync('python3', ['-c', 'import json,sys;print(json.dumps(list(sys.version_info[:2])))'], { encoding: 'utf8', timeout: 5000 }));
    if (version[0] < 3 || (version[0] === 3 && version[1] < (process.platform === 'darwin' ? 13 : 10)))
      throw new Error('Python 3.13+ on macOS or 3.10+ on Linux is required');
  }
  const pack = await readJson(join(root, `packs/${id}/manifest.json`));
  if (pack.connector.registry !== `toolkits/sky-mcp-connector/registry.${id}.json`) throw new Error('Invalid connector reference');
  if (id === 'brand-operations') {
    stateDir = resolve(stateDir ?? join(homedir(), '.noah-agent-operations', id));
    await privateState(stateDir);
    // The fixed registry forwards ONLY these two values. Provider secrets and mode overrides never enter the child.
    process.env.FASHION_BRAND_DB_PATH = join(stateDir, 'fashion.db');
    process.env.ROCKSTAR_TENANT_ID = 'noah-local-owner';
  }
  const discovery = await mkdtemp(join(tmpdir(), 'noah-empty-discovery-'));
  const { createConnector } = await import('./toolkits/sky-mcp-connector/server.mjs');
  let connector;
  try {
    connector = await createConnector({ registryPath: join(root, pack.connector.registry), port,
      allowedOrigins: new Set([origin]), localToolDirectory: discovery });
  } catch (error) {
    await rm(discovery, { recursive: true, force: true });
    throw error;
  }
  let closing;
  return { ...connector, pack, stateDir, close() {
    closing ??= (async () => {
      const children = stopChildren(connector.hub);
      await new Promise((done, reject) => connector.server.close(error => error ? reject(error) : done()));
      await children;
      await rm(discovery, { recursive: true, force: true });
    })();
    return closing;
  } };
}

async function main() {
  const [command = 'help', id, ...options] = process.argv.slice(2);
  if (command === 'help') {
    console.log('Noah Agent運用パック\nnode noah.mjs list\nnode noah.mjs verify\nnode noah.mjs demo\nnode noah.mjs start <article-editing|delivery-support|brand-operations> --origin <Webのorigin> [--port 38479] [--state-dir <brand保存先>]\n停止: Ctrl+C。再開: 同じコマンドで起動し、画面で再接続。');
    return;
  }
  if (command !== 'start' && (id !== undefined || options.length)) throw new Error('Unexpected arguments');
  if (command === 'verify') console.log(JSON.stringify(await verifyBundle()));
  else if (command === 'list') { await verifyBundle(); console.log(JSON.stringify(await readJson(join(root, 'index.json')), null, 2)); }
  else if (command === 'demo') { await verifyBundle(); console.log(JSON.stringify(await (await import('./demo.mjs')).runDemo(), null, 2)); }
  else if (command === 'start') {
    const values = {};
    for (let i = 0; i < options.length; i += 2) {
      const key = options[i];
      if (!['--origin', '--port', '--state-dir'].includes(key) || !options[i + 1] || Object.hasOwn(values, key)) throw new Error('Invalid or duplicate option');
      values[key] = options[i + 1];
    }
    if (!values['--origin']) throw new Error('--origin is required');
    const session = await startPack(id, { origin: values['--origin'], port: values['--port'] === undefined ? 38479 : Number(values['--port']), stateDir: values['--state-dir'] });
    console.log(JSON.stringify({ pack: id, mode: session.pack.mode, url: `http://127.0.0.1:${session.port}`, origin: values['--origin'], stateDir: session.stateDir,
      message: 'Connector起動済み。画面で本人接続してToolを選びます。Agent自動登録・仕事の自動実行は行いません。' }));
    const stop = () => session.close().then(() => { process.exitCode = 0; }, error => { console.error(error.message); process.exitCode = 1; });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } else throw new Error('Unknown command; use help');
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
