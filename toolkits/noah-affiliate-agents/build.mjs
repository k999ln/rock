import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseNoahAgentManifest, noahPublicUrl } from '../../lib/noah-agent-upload.ts';
import { writeNoahArchive } from '../../lib/noah-source-archive.ts';
import { validateCatalog, publicCatalog } from './core.mjs';

export function manifest(role, origin) {
  if (!['consult', 'operations'].includes(role)) throw new Error('unknown role');
  const endpoint = origin ? new URL(noahPublicUrl(origin)) : null;
  if (endpoint && endpoint.pathname !== '/') throw new Error('originだけを指定してください。');
  return parseNoahAgentManifest({
    schema: 'noah-agent/1', id: `affiliate-${role}`, version: '1.0.0',
    name: role === 'consult' ? 'Web・PC相談' : '紹介案件の運営（本人用）',
    summary: role === 'consult' ? '困りごとを整理し、無料の対処手順と掲載条件を確認済みの候補を返します。' : '本人の案件台帳を点検し、紹介原稿の下書きと承認・保留を分けた実績集計を返します。',
    author: '本人', license: 'Private', sourceUrl: null,
    adapter: endpoint ? 'mcp_http' : 'source', endpointUrl: endpoint ? `${endpoint.origin}/${role}/mcp` : null,
    permissions: endpoint ? ['read_input', 'network', ...(role === 'operations' ? ['external_account'] : [])] : ['read_input', 'write_files'],
    priceNote: '初版の処理は規則ベース。紹介先の利用料・実行環境の費用は別途確認してください。申込・投稿・決済は実行しません。',
    ...(!endpoint ? { runtime: { schema: 'noah-terminal/1', language: 'node', entrypoint: 'main.mjs', model: 'none' } } : {}),
  });
}

export async function bundles(raw, now = Date.now()) {
  const catalog = validateCatalog(raw);
  const shared = await Promise.all(['core.mjs', 'terminal.mjs'].map(async name => ({ name, content: await readFile(new URL(name, import.meta.url), 'utf8') })));
  return ['consult', 'operations'].map(role => {
    const definition = manifest(role);
    const files = [...shared,
      { name: 'main.mjs', content: `import { terminal } from './terminal.mjs';\nawait terminal('${role}');\n` },
      { name: 'noah-agent.json', content: JSON.stringify(definition, null, 2) },
      { name: 'catalog.json', content: JSON.stringify(role === 'consult' ? publicCatalog(catalog, now) : catalog, null, 2) },
      { name: 'agent.test.mjs', content: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { runAction, consult, analyze } from './core.mjs';\nconst empty = {schema:'noah-affiliate-catalog/1',version:'test',offers:[]};\ntest('相談は無料の対処を返し、運営権限を持たない',()=>{assert.equal(consult({topic:'website',channel:'chat'},empty).offers.length,0);assert.throws(()=>runAction('consult',{action:'audit'},empty));});\ntest('承認と保留を混ぜない',()=>{const r=analyze({periodStart:'2026-01-01',periodEnd:'2026-01-02',rows:[{offerId:'test',clicks:4,pending:2,approved:1,rejected:1,pendingYen:1000,approvedYen:50}]});assert.equal(r.approvalRate,0.5);assert.equal(r.totals.approvedYen,50);});\n` },
    ];
    const zip = writeNoahArchive(files.map(f => ({ name: f.name, bytes: new TextEncoder().encode(f.content), os: 0, attrs: 0 })));
    return { role, manifest: definition, zip, sha256: createHash('sha256').update(zip).digest('hex') };
  });
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--catalog', '--out', '--origin'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('--catalog / --out / --origin を確認してください。');
    options[args[i]] = args[i + 1];
  }
  if (!options['--out']) throw new Error('本人用の保存先を --out で指定してください。');
  const raw = await readFile(options['--catalog'] ? resolve(options['--catalog']) : new URL('catalog.example.json', import.meta.url), 'utf8');
  if (Buffer.byteLength(raw) > 65536) throw new Error('台帳は64KiB以下にしてください。');
  const output = resolve(options['--out']);
  const artifacts = await bundles(JSON.parse(raw));
  // Validate optional deployment origin before any file is emitted.
  const remote = options['--origin'] ? artifacts.map(a => manifest(a.role, options['--origin'])) : [];
  await mkdir(output, { recursive: true, mode: 0o700 });
  for (const a of artifacts) {
    await writeFile(resolve(output, `${a.manifest.id}.zip`), a.zip, { mode: 0o600 });
    await writeFile(resolve(output, `${a.manifest.id}.json`), JSON.stringify(a.manifest, null, 2), { mode: 0o600 });
  }
  for (const m of remote) await writeFile(resolve(output, `${m.id}-mcp.json`), JSON.stringify(m, null, 2), { mode: 0o600 });
  await writeFile(resolve(output, 'SHA256SUMS'), artifacts.map(a => `${a.sha256}  ${a.manifest.id}.zip`).join('\n') + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ output, artifacts: artifacts.map(a => ({ id: a.manifest.id, bytes: a.zip.length, sha256: a.sha256 })), deployed: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('パッケージ作成に失敗しました。引数と台帳の形式を確認してください。'); process.exitCode = 1; });
}
