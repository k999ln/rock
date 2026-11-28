// 道具の定義の写し（data/noah-tool-catalog.json）を、本番の巡回と同じ握手で取り直す（task 128 の 9.8）。
// 本番の Agent の詳細は、写しの hash と道具の数が本番の今の握手の記録と合う時だけ、道具の一覧（「こんな事を頼めます」と「操作の流れと道具」）を出す。
// 相手が道具を足したり書き直したりすると写しが合わなくなり、その Agent の詳細から道具の一覧が消える。その系列を取り直す。
//
// 使い方（--experimental-strip-types が要る。lib の .ts を読むため）:
//   node --experimental-strip-types scripts/noah-tool-catalog-refresh.mjs           本番で道具の一覧が出ていない系列だけ。表を出すだけ
//   node --experimental-strip-types scripts/noah-tool-catalog-refresh.mjs --write   写しを data/noah-tool-catalog.json に書く
//   --all（掲載中の全部の系列）・--ids a,b（その系列だけ）・--origin https://avoado.si
//
// 決まり:
// - 道具は呼ばない。握手 → 初期化の通知 → 道具の一覧 → 閉じる、だけ（lib/noah-mouth-mcp-remote.ts の noahMcpHandshake。巡回と同じ名乗り）。
// - 本番には書かない。本番から読むのは公開の API（掲載の一覧・Agent の詳細・接続の計画）だけ。
// - 接続先は、公式台帳の今の記録から、取り込みと同じ下書き（lib/noah-intake-draft.ts の draftFromRegistry）で決める。
//   本番の記録の hash（接続の計画の digest）と違う時も取り直すが、表に「台帳が新しい」と書く（本番が台帳を読み直すまで、写しは合わないことがある）。
// - 写しは系列ごとに、新しい順に 2 つまで。本番の巡回が相手を確かめ直すのは 3〜7 日おきなので、取り直した直後は、本番の今の hash が 1 つ前の写しと合う事がある。
// - 道具の説明は、提供者の説明の最初の 1 文を 160 文字まで（原文のまま）。秘密に見える文は載せない。入力・出力は項目名と型と必須かどうかだけ。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOAH_CATALOG_PATH = 'data/noah-tool-catalog.json';
/** 1 つの系列に持つ写しの数。 */
export const NOAH_CATALOG_KEEP = 2;
const SUMMARY_MAX = 160;

// 文の終わりに見えても、文の終わりではない物（略語の点）。
const ABBREVIATION = /(?:^|[\s(（[{"'“‘])(?:e\.g|i\.e|etc|vs|approx|incl|excl|esp|cf|fig|no|nos|st|mr|mrs|ms|dr|inc|ltd|co|jr|sr|u\.s|u\.k|a\.m|p\.m)\.$/iu;

/**
 * 提供者の説明の最初の 1 文。長ければ 159 文字で切って「…」。
 * 文の終わりと見ないのは、小文字で続く「. 」・略語（e.g. など）の点・閉じていない括弧の中・2 語までの札だけの文（Read-only. など）の後。
 */
export function noahCatalogSummary(description) {
  const flat = String(description ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  let first = flat;
  for (const match of flat.matchAll(/[.!?](?=\s+[^\s\p{Ll}])|[。！？]/gu)) {
    const head = flat.slice(0, match.index + match[0].length);
    if (match[0] === '.' && ABBREVIATION.test(head)) continue;
    if ((head.match(/[(（[]/gu) ?? []).length > (head.match(/[)）\]]/gu) ?? []).length) continue;
    // 「Read-only.」「Free.」「Step 1.」のような札だけの文は、次の文までつなぐ（札だけでは、何をする道具か分からない）。
    if (/^[\x20-\x7e]*$/u.test(head) && head.split(' ').length < 3) continue;
    first = head;
    break;
  }
  if (Array.from(first).length <= SUMMARY_MAX) return first;
  return Array.from(first).slice(0, SUMMARY_MAX - 1).join('').replace(/[\s,;:、，]+$/u, '') + '…';
}

const fields = (schema) => {
  const properties = schema && typeof schema === 'object' && schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  return Object.entries(properties).map(([field, value]) => ({ field, type: typeof value?.type === 'string' ? value.type : null, required: required.has(field) }));
};

/** 握手で取れた道具 1 つを、写しの形（lib/noah-agent-explanation.ts の NoahToolDefinition）にする。looksSecret は秘密に見えるかを返す関数。 */
export function noahCatalogDefinition(tool, looksSecret = () => false) {
  const summary = noahCatalogSummary(tool.description);
  return {
    name: tool.name,
    inputs: fields(tool.inputSchema),
    outputs: tool.outputSchema === undefined ? null : fields(tool.outputSchema),
    ...(summary && !looksSecret(summary) ? { summary } : {}),
  };
}

/**
 * 系列 1 つの写しに、新しい写しを入れる。返すのは、書く値（写しが 1 つなら物、2 つなら新しい順の並び）と、変わったか。
 * 同じ hash の写しがもうあれば、それを先頭にするだけ（中身は書き換えない）。
 */
export function noahCatalogMerge(previous, entry) {
  const list = previous ? (Array.isArray(previous) ? previous : [previous]) : [];
  const same = list.find((item) => item.toolsSha256 === entry.toolsSha256);
  const next = [same ?? entry, ...list.filter((item) => item.toolsSha256 !== entry.toolsSha256)].slice(0, NOAH_CATALOG_KEEP);
  const value = next.length === 1 ? next[0] : next;
  return { value, changed: JSON.stringify(value) !== JSON.stringify(previous ?? null), added: !same };
}

/** 公式台帳の記録を、取り込み（lib/noah-intake-sync.ts の registryRecord）と同じ項目だけにする。記録の hash を本番と比べるため。 */
export function noahCatalogRegistryRecord(value) {
  if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !value.name) return null;
  const out = {};
  for (const key of ['name', 'title', 'description', 'version', 'websiteUrl']) if (value[key] !== undefined) out[key] = value[key];
  for (const key of ['remotes', 'packages']) if (value[key] !== undefined) out[key] = value[key];
  if (value.repository && typeof value.repository === 'object' && typeof value.repository.url === 'string') out.repository = { url: value.repository.url };
  return out;
}

/** 写しの全体を、鍵の順に並べた 1 行の JSON にする（今の data/noah-tool-catalog.json と同じ書き方）。 */
export function noahCatalogText(catalog) {
  const series = Object.fromEntries(Object.keys(catalog.series).sort().map((id) => [id, catalog.series[id]]));
  return JSON.stringify({ schema: catalog.schema, source: catalog.source, series }) + '\n';
}

async function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const flag = (name) => argv.includes(name);
  const value = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const origin = new URL(value('--origin') ?? 'https://avoado.si').origin;
  const only = value('--ids')?.split(',').map((id) => id.trim()).filter(Boolean) ?? null;
  const [{ draftFromRegistry }, { canonicalJson, sha256Hex, looksLikeNoahSecret }, { createNoahGuardedFetch, noahMcpHandshake, noahMcpClose }] = await Promise.all([
    import('../lib/noah-intake-draft.ts'), import('../lib/noah-connect-requirements.ts'), import('../lib/noah-mouth-mcp-remote.ts'),
  ]);
  const get = async (url) => {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    return { status: response.status, json: response.ok ? await response.json().catch(() => null) : null };
  };
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));

  // 1. 掲載中の系列と、本番の道具の数。
  const listed = [];
  for (let cursor = null, page = 0; page < 100; page++) {
    const { status, json } = await get(`${origin}/api/noah/intake${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!json) throw new Error(`掲載の一覧を読めません（${status}）。`);
    listed.push(...(json.items ?? []));
    cursor = json.nextCursor;
    if (!cursor) break;
    await pause(200);
  }
  // 2. 取り直す系列。既定は、本番の詳細に道具の一覧が出ていない物だけ。
  let targets = listed.filter((item) => !only || only.includes(item.id));
  if (!flag('--all') && !only) {
    const missing = [];
    for (const item of targets) {
      const { json } = await get(`${origin}/api/noah/intake?id=${encodeURIComponent(item.id)}`);
      if (!(json?.explanation?.steps ?? []).some((step) => String(step.id).startsWith('tool:'))) missing.push(item);
      await pause(150);
    }
    targets = missing;
  }

  const path = resolve(root, NOAH_CATALOG_PATH);
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  const ctx = {
    fetch: createNoahGuardedFetch(fetch, { sameHost: true }),
    headers: async () => ({ 'user-agent': `NoahBot/1 (+${origin}/noah/help#bot)` }),
  };
  const rows = [];
  let index = 0;
  async function worker() {
    while (index < targets.length) {
      const item = targets[index++];
      const row = { id: item.id, listedTools: item.tools, result: '', tools: null, registry: '' };
      rows.push(row);
      try {
        const name = item.id.replace(/^mcp-registry:/, '');
        if (name === item.id) { row.result = '公式台帳の系列ではない'; continue; }
        const [plan, registry] = await Promise.all([
          get(`${origin}/api/noah/connect-plan?agent=${encodeURIComponent(item.id)}`),
          get(`https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(name)}/versions/latest`),
        ]);
        const record = noahCatalogRegistryRecord(registry.json?.server);
        if (!record) { row.result = `台帳を読めない（${registry.status}）`; continue; }
        row.registry = plan.json?.digest === await sha256Hex(canonicalJson(record)) ? '本番と同じ' : '台帳が新しい';
        const draft = await draftFromRegistry(record);
        const url = draft.ok && draft.connect.mouth === 'mcp-remote' ? draft.connect.target?.url : null;
        if (typeof url !== 'string') { row.result = '接続先が無い'; continue; }
        let handshake;
        try { handshake = await noahMcpHandshake(url, { ...ctx, signal: AbortSignal.timeout(20_000) }); }
        catch (error) { row.result = `握手が通らない（${error?.code ?? 'unreachable'}）`; continue; }
        await noahMcpClose(handshake.session, ctx).catch(() => {});
        row.tools = handshake.tools.length;
        if (!handshake.tools.length) { row.result = '道具が無い'; continue; }
        const entry = { toolsSha256: handshake.toolsSha256, tools: handshake.tools.map((tool) => noahCatalogDefinition(tool, looksLikeNoahSecret)) };
        const merged = noahCatalogMerge(catalog.series[item.id], entry);
        catalog.series[item.id] = merged.value;
        row.result = !merged.changed ? '写しと同じ' : merged.added ? (row.tools === item.tools ? '足した' : '足した（数が本番と違う）') : '並べ替えた';
      } catch (error) {
        row.result = `失敗（${String(error?.message ?? error).slice(0, 80)}）`;
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const row of rows) console.log([row.id, row.result, `本番 ${row.listedTools} 個・取得 ${row.tools ?? '-'} 個`, row.registry].filter(Boolean).join('\t'));
  const count = (pattern) => rows.filter((row) => pattern.test(row.result)).length;
  console.log(`対象 ${targets.length} 系列（掲載 ${listed.length}）: 足した ${count(/^足した$/)}・足した（数が本番と違う）${count(/数が本番と違う/)}・写しと同じ ${count(/写しと同じ/)}・取れなかった ${rows.length - count(/^足した|写しと同じ|並べ替えた/)}`);
  if (flag('--write')) {
    catalog.source = `Noah production tools/list handshake catalog refresh, ${new Date().toISOString().slice(0, 10)} (scripts/noah-tool-catalog-refresh.mjs)`;
    writeFileSync(path, noahCatalogText(catalog));
    console.log(`書いた: ${NOAH_CATALOG_PATH}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error?.message ?? error); process.exitCode = 1; });
}
