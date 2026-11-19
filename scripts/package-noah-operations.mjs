import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, lstat, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { noahOperationPacks, noahOperationCandidates, NOAH_OPERATIONS_VERSION } from '../lib/noah-operation-packs.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg, i) => !['--out', '--check'].includes(arg) && args[i - 1] !== '--out') ||
    args.filter(arg => arg === '--out').length > 1 || (args.includes('--out') && !args[args.indexOf('--out') + 1]))
  throw new Error('Usage: package-noah-operations.mjs [--out directory] [--check]');
const out = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : `work/noah-operation-packs/${NOAH_OPERATIONS_VERSION}`);
const name = `noah-agent-operations-${NOAH_OPERATIONS_VERSION}`;
const output = resolve(out, `${name}.zip`);
const files = new Map();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
async function add(source, destination) {
  const path = resolve(root, source);
  if (!(await lstat(path)).isFile()) throw new Error(`Regular source required: ${source}`);
  files.set(destination, await readFile(path));
}
// Only tracked source in explicit directories. No runtime state, env, tests or dependencies.
const tracked = execFileSync('git', ['ls-files', '-z', '--', 'toolkits/mr', 'vendor/mr', 'toolkits/fashion-brand-ops'], { cwd: root }).toString().split('\0').filter(Boolean);
for (const path of tracked) {
  if (/^toolkits\/mr\/(?:[^/]+\.py|README\.md|examples\/.+\.(?:json|md))$/.test(path)) await add(path, path);
  if (/^vendor\/mr\/(?:[^/]+\.py|LICENSE|provenance\.json)$/.test(path)) await add(path, `toolkits/mr/${path}`);
  if (/^toolkits\/fashion-brand-ops\/(?:src\/.+\.mjs|db\/migrations\/.+\.sql|package\.json|README\.md)$/.test(path)) await add(path, path);
}
for (const file of ['server.mjs', 'pilot-policy.mjs', 'local-descriptor.mjs', 'registry.schema.json'])
  await add(`toolkits/sky-mcp-connector/${file}`, `toolkits/sky-mcp-connector/${file}`);
await add('toolkits/spider-guard/detector.mjs', 'toolkits/spider-guard/detector.mjs');
for (const file of ['noah.mjs', 'demo.mjs', 'README.md']) await add(`toolkits/noah-agent-operations/${file}`, file);
const vendor = JSON.parse(await readFile(resolve(root, 'vendor/mr/provenance.json'), 'utf8'));
for (const record of vendor.files) {
  if (sha(files.get(`toolkits/mr/vendor/mr/${record.file}`)) !== record.sha256) throw new Error(`Vendor hash mismatch: ${record.file}`);
}
const packs = noahOperationPacks();
const registry = JSON.parse(await readFile(resolve(root, 'toolkits/sky-mcp-connector/registry.json'), 'utf8'));
for (const pack of packs) {
  const server = registry.servers.find(item => item.id === pack.connector.serverId);
  if (!server) throw new Error(`Unknown connector: ${pack.id}`);
  const scoped = { ...server, required: true };
  if (pack.id === 'brand-operations') scoped.env = ['FASHION_BRAND_DB_PATH', 'ROCKSTAR_TENANT_ID'];
  files.set(pack.connector.registry, json({ schema: registry.schema, servers: [scoped] }));
  files.set(`packs/${pack.id}/manifest.json`, json(pack));
  for (const role of pack.roles) files.set(`packs/${pack.id}/agents/${role.id}.json`, json(role.settings));
}
files.set('index.json', json({ schema: 'noah.operation-pack-set/1', version: NOAH_OPERATIONS_VERSION,
  packs: packs.map(({ id, name, mode }) => ({ id, name, mode, manifest: `packs/${id}/manifest.json` })),
  candidates: noahOperationCandidates() }));
files.set('package-lock.json', json({ schema: 'noah.operation-pack-lock/1', version: NOAH_OPERATIONS_VERSION,
  files: Object.fromEntries([...files].sort(([a], [b]) => a < b ? -1 : 1).map(([path, bytes]) => [path, { sha256: sha(bytes), bytes: bytes.length }])) }));
const payload = JSON.stringify(Object.fromEntries([...files].map(([path, bytes]) => [`${name}/${path}`, bytes.toString('base64')])));
const scratch = await mkdtemp(resolve(tmpdir(), 'noah-pack-build-'));
let archive;
try {
  const input = resolve(scratch, 'files.json');
  const zipped = resolve(scratch, 'package.zip');
  await writeFile(input, payload, { mode: 0o600 });
  execFileSync('python3', ['-c',
    'import sys,json,base64,zipfile\nwith open(sys.argv[1]) as f:files=json.load(f)\nwith zipfile.ZipFile(sys.argv[2],"x",zipfile.ZIP_DEFLATED) as z:\n for name,data in sorted(files.items()):\n  i=zipfile.ZipInfo(name,date_time=(2026,11,8,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,base64.b64decode(data))', input, zipped],
    { stdio: 'pipe', timeout: 30_000 });
  archive = await readFile(zipped);
} finally { await rm(scratch, { recursive: true, force: true }); }
if (args.includes('--check')) {
  if (!(await readFile(output)).equals(archive)) throw new Error('Package differs from source. Build into a new directory.');
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, archive, { flag: 'wx' });
  await writeFile(`${output}.sha256`, `${sha(archive)}  ${name}.zip\n`, { flag: 'wx' });
}
console.log(JSON.stringify({ path: output, sha256: sha(archive), files: files.size, packs: packs.length, candidates: noahOperationCandidates().length, checked: args.includes('--check') }));
