/**
 * Noah 取り込み: 外の台帳の 1 件 → 接続要件の下書き、名寄せ、見本の入力、見回りの間隔。
 *
 * Design contract only. No network calls, credentials or production mutations.
 * ここの関数は何も実行しない。台帳の「型の付いた項目」だけを読み、説明文は読まない。
 * 仕様の本文は docs/noah/spec-85-intake.md・spec-88-mass-probe.md・spec-89-terminal-mouth.md。
 */
import {
  canonicalJson,
  isNoahPublicHost,
  looksLikeNoahSecret,
  NOAH_RESERVED_HEADERS,
  NoahConnectError,
  noahPublicHttpsUrl,
  parseNoahConnect,
  sha256Hex,
  type NoahConnect,
  type NoahHeader,
  type NoahPackageTarget,
} from './noah-connect-v1.ts';

// ---------------------------------------------------------------------------
// 公式台帳（MCP Registry）の記録。使う項目だけ。
// ---------------------------------------------------------------------------

export type RegistryInput = {
  type?: string;
  name?: string;
  value?: string;
  default?: string;
  format?: string;
  valueHint?: string;
  isRequired?: boolean;
  isSecret?: boolean;
};
export type RegistryRemote = { type?: string; url?: string; headers?: RegistryInput[] };
export type RegistryPackage = {
  registryType?: string;
  identifier?: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type?: string };
  runtimeArguments?: RegistryInput[];
  packageArguments?: RegistryInput[];
  environmentVariables?: RegistryInput[];
};
export type RegistryServer = {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: { url?: string };
  websiteUrl?: string;
  remotes?: RegistryRemote[];
  packages?: RegistryPackage[];
};

/** 下書きを作れなかった理由。件数を集計して、運営の画面に出す。 */
export const NOAH_INTAKE_REASONS = [
  'no_endpoint',            // remotes も packages も無い
  'legacy_sse_only',        // 旧い SSE の接続先だけ
  'bad_url',                // HTTPS でない、内部向け、host に差し込みがある
  'bad_header',             // 名前の形が違う header
  'published_secret',       // 台帳に鍵そのものが公開されている。Noah は運ばない
  'unsupported_registry',   // mcpb・cargo・nuget など、型紙の無い配布
  'bad_identifier',         // 識別子か版の形が型紙に合わない
  'needs_runtime_arguments',// 実行器（npx・uvx・docker）への必須の引数が、型紙の外
  'needs_host_file',        // 本人の端末のファイルや mount が必須
  'bad_argument',           // 引数の形が検査を通らない
  'bad_env',                // 必須の環境変数の名前の形が違う
] as const;
export type NoahIntakeReason = (typeof NOAH_INTAKE_REASONS)[number];
export type NoahDraft =
  | { ok: true; connect: NoahConnect; notes: string[] }
  | { ok: false; reason: NoahIntakeReason; detail: string };

const HEADER_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const TEMPLATE = /^[A-Za-z0-9 _-]{0,40}\{[A-Za-z_][A-Za-z0-9_]{0,63}\}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ARG = /^[A-Za-z0-9@%_+=:,./-]{1,200}$/;
const FLAG = /^--?[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const WORD = /^[A-Za-z0-9][A-Za-z0-9._:=-]{0,63}$/;
const VARIABLE = /\{([A-Za-z_][A-Za-z0-9_]{0,63})\}/g;
const no = (reason: NoahIntakeReason, detail: string): NoahDraft => ({ ok: false, reason, detail });
const literal = (input: RegistryInput) => typeof input.value === 'string' && !input.value.includes('{');

function remoteDraft(remote: RegistryRemote, base: object): NoahDraft {
  let url: URL;
  try {
    url = noahPublicHttpsUrl(remote.url, 'url');
  } catch (error) {
    return no('bad_url', error instanceof Error ? error.message : 'url');
  }
  const headers: NoahHeader[] = [];
  const secrets: string[] = [];
  for (const h of remote.headers ?? []) {
    if (!h.isRequired) continue;
    const name = String(h.name ?? '');
    if (NOAH_RESERVED_HEADERS.includes(name.toLowerCase())) continue;   // Noah の口が自分で付ける
    if (!HEADER_NAME.test(name)) return no('bad_header', name);
    if (typeof h.value === 'string' && h.value.includes('{')) {
      // 型が読めない差し込み（`${NAME}` など）は、header の値をまるごと本人が入れる物として扱う。
      headers.push({ name, required: true, secret: true, ...(TEMPLATE.test(h.value) ? { template: h.value } : {}) });
      secrets.push(name);
    } else if (typeof h.value === 'string') {
      if (h.isSecret || looksLikeNoahSecret(h.value) || h.value.length > 200) return no('published_secret', name);
      headers.push({ name, required: true, secret: false, value: h.value });
    } else {
      headers.push({ name, required: true, secret: true });
      secrets.push(name);
    }
  }
  for (const m of String(remote.url).matchAll(VARIABLE)) secrets.push(`URL の ${m[1]}`);
  if (headers.length > 8 || secrets.length > 16) return no('bad_header', '多すぎます');
  return finish({
    ...base, mouth: 'mcp-remote', surface: 'none', places: ['provider'], target: { url: remote.url, headers },
    codeDelivery: 'none', model: { use: 'provider', needs: [], minContextTokens: 0 }, egress: [url.hostname],
    services: [], secrets, uses: [],
  }, []);
}

type Launch = { args: string[]; command?: string; extras?: string[]; secrets: string[]; notes: string[] };

/**
 * 実行器（npx・uvx・docker）への引数を、型紙の中の意味へ読み替える。台帳の書き方が揺れているので、
 * 引数を語の並びに直してから読む。読み替えられない必須の引数は理由を返す。任意の物は使わずに notes へ残す。
 */
function readRuntimeArguments(type: 'npm' | 'pypi' | 'oci', pkg: RegistryPackage, launch: Launch): NoahIntakeReason | null {
  const id = String(pkg.identifier);
  const stem = (x: string) => x.toLowerCase().replace(/[._]/g, '-');
  const tokens: { text: string; required: boolean; literal: boolean }[] = [];
  for (const a of pkg.runtimeArguments ?? []) {
    const required = Boolean(a.isRequired);
    if (a.type === 'named') tokens.push({ text: String(a.name ?? ''), required, literal: true });
    if (a.type !== 'named' || a.value !== undefined) tokens.push({ text: String(a.value ?? ''), required, literal: literal(a) });
  }
  const self = (t: string) => [id, `${id}@${pkg.version}`, `${id}==${pkg.version}`].includes(t);
  const forPackage = (t: { text: string; literal: boolean }) => t.literal && (WORD.test(t.text) || t.text === '--stdio' || t.text === '--mcp');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (type === 'oci') {
      // mount は本人の端末のファイルを求める。残り（--rm・-i・--network など）は Noah の隔離の引数で置き換える。
      if (['-v', '--volume', '--mount'].includes(t.text) && t.required) return 'needs_host_file';
      continue;
    }
    if (self(t.text)) continue;
    if (type === 'npm') {
      if (['-y', '--yes'].includes(t.text)) continue;
      if (['-p', '--package'].includes(t.text) && next && self(next.text)) {
        i++;
        if (tokens[i + 1] && forPackage(tokens[i + 1]) && WORD.test(tokens[i + 1].text)) launch.command = tokens[++i].text;
        continue;
      }
      if (forPackage(t)) { launch.args.push(t.text); continue; }   // package の副コマンドとして読む
    } else {
      if (t.text === '--from' && next?.literal) {
        const m = /^([A-Za-z0-9._-]+)(?:\[([A-Za-z0-9._,-]+)\])?(?:==([0-9A-Za-z.+!-]+))?$/.exec(next.text);
        if (m && stem(m[1]) === stem(id) && (!m[3] || m[3] === pkg.version)) {
          i++;
          if (m[2]) launch.extras = m[2].split(',');
          if (tokens[i + 1] && forPackage(tokens[i + 1]) && WORD.test(tokens[i + 1].text)) launch.command = tokens[++i].text;
          else launch.command = '';   // package の最初の位置引数が bin の名前かを、後で見る
          continue;
        }
      }
      if (t.text === '--python' && next) { i++; launch.notes.push('Python の版の指定を使いません'); continue; }
      if (forPackage(t)) {
        // package の名前で始まる別の語は bin の名前。それ以外は副コマンド。
        if (launch.command === undefined && !launch.args.length && WORD.test(t.text) && stem(t.text).startsWith(stem(id))) launch.command = t.text;
        else launch.args.push(t.text);
        continue;
      }
    }
    if (t.required) return 'needs_runtime_arguments';
    launch.notes.push(`実行器の引数を使いません: ${t.text}`);
  }
  return null;
}

function readPackageArguments(pkg: RegistryPackage, launch: Launch): NoahIntakeReason | null {
  for (const a of pkg.packageArguments ?? []) {
    const named = a.type === 'named';
    const name = named ? String(a.name ?? '') : String(a.valueHint ?? a.name ?? '位置引数');
    if (named && !FLAG.test(name)) { if (a.isRequired) return 'bad_argument'; continue; }
    if (literal(a)) {
      if (!ARG.test(a.value!) || looksLikeNoahSecret(a.value!)) return 'bad_argument';
      if (launch.command === '') {
        // `--from` の後の bin の名前。package の名前で始まる語だけを bin として読む。違えば package と同じ名前の bin。
        const stem = (x: string) => x.toLowerCase().replace(/[._]/g, '-');
        if (!named && WORD.test(a.value!) && stem(a.value!).startsWith(stem(String(pkg.identifier)))) { launch.command = a.value!; continue; }
        launch.command = undefined;
      }
      if (named) launch.args.push(name);
      launch.args.push(a.value!);
    } else if (named && a.value === undefined && !a.isRequired) {
      continue;                           // 任意の flag は付けない
    } else if (a.isRequired) {
      if (a.format === 'filepath') return 'needs_host_file';
      launch.secrets.push(`引数 ${name}`);  // 本人の入力が要る
    }
  }
  if (launch.command === '') launch.command = undefined;
  return launch.args.length > 16 ? 'bad_argument' : null;
}

function packageDraft(pkg: RegistryPackage, base: object): NoahDraft {
  const type = pkg.registryType as 'npm' | 'pypi' | 'oci';
  let identifier = String(pkg.identifier ?? '');
  let version = String(pkg.version ?? '');
  let integrity: string | null = null;
  if (type === 'oci') {
    const at = identifier.indexOf('@sha256:');
    if (at >= 0) { integrity = identifier.slice(at + 1); identifier = identifier.slice(0, at); }
    const tail = identifier.slice(identifier.lastIndexOf('/') + 1);
    if (tail.includes(':')) { version = tail.slice(tail.indexOf(':') + 1); identifier = identifier.slice(0, identifier.lastIndexOf(':')); }
    else if (integrity) version = '';
    if (!identifier.split('/')[0].includes('.')) identifier = `docker.io/${identifier}`;
  }
  const launch: Launch = { args: [], secrets: [], notes: [] };
  const reason = readRuntimeArguments(type, pkg, launch) ?? readPackageArguments(pkg, launch);
  if (reason) return no(reason, identifier);

  const env: string[] = [];
  const fixedEnv: { name: string; value: string }[] = [];
  for (const e of pkg.environmentVariables ?? []) {
    if (!e.isRequired) continue;
    const name = String(e.name ?? '');
    if (!ENV_NAME.test(name)) return no('bad_env', name);
    const fixed = typeof e.value === 'string' ? e.value : e.default;
    if (!e.isSecret && typeof fixed === 'string' && ARG.test(fixed) && !looksLikeNoahSecret(fixed)) fixedEnv.push({ name, value: fixed });
    else { env.push(name); launch.secrets.push(name); }
  }
  if (env.length > 32 || fixedEnv.length > 16 || launch.secrets.length > 16) return no('bad_env', '多すぎます');
  const target: NoahPackageTarget = {
    registryType: type, identifier, version, integrity, args: launch.args,
    ...(launch.command ? { command: launch.command } : {}),
    ...(launch.extras ? { extras: launch.extras } : {}),
    env,
    ...(fixedEnv.length ? { fixedEnv } : {}),
  };
  return finish({
    ...base, mouth: 'mcp-package', surface: 'terminal', places: ['home', 'cloud'], target, codeDelivery: 'device_allowed',
    model: { use: 'none', needs: [], minContextTokens: 0 }, egress: [], services: [], secrets: launch.secrets, uses: [],
  }, ['通信先は台帳に宣言が無い。接続試験で求めた host を記録し、本人に確かめる', ...launch.notes]);
}

function finish(value: object, notes: string[]): NoahDraft {
  try {
    return { ok: true, connect: parseNoahConnect(value), notes };
  } catch (error) {
    if (!(error instanceof NoahConnectError)) throw error;
    const reason: NoahIntakeReason =
      error.code === 'url' ? 'bad_url'
      : error.code === 'secret' ? 'published_secret'
      : error.code === 'header' ? 'bad_header'
      : error.code === 'env' ? 'bad_env'
      : error.code === 'arg' ? 'bad_argument'
      : 'bad_identifier';
    return no(reason, error.message);
  }
}

/** 取り込んだ 1 件の ID。出どころと、その中の鍵。 */
export const noahCandidateId = (source: 'mcp-registry' | 'hf-mcp-space' | 'acp-registry', key: string) => `${source}:${key}`;

/**
 * 公式台帳の 1 件から、接続要件の下書きを作る。
 * 順: 1) HTTPS の streamable-http の接続先 → 2) 標準入出力の package（npm・pypi・oci。記録の順）。
 */
export async function draftFromRegistry(server: RegistryServer): Promise<NoahDraft> {
  const base = {
    schema: 'noah-connect/1',
    candidateId: noahCandidateId('mcp-registry', server.name),
    candidateDigest: await sha256Hex(canonicalJson(server)),
  };
  const remotes = server.remotes ?? [];
  const http = remotes.find((r) => r.type === 'streamable-http');
  let firstFailure: NoahDraft | null = null;
  if (http) {
    const draft = remoteDraft(http, base);
    if (draft.ok) return draft;
    firstFailure = draft;
  }
  const stdio = (server.packages ?? []).filter((p) => p.transport?.type === 'stdio');
  for (const pkg of stdio.filter((p) => ['npm', 'pypi', 'oci'].includes(String(p.registryType)))) {
    const draft = packageDraft(pkg, base);
    if (draft.ok) return draft;
    firstFailure ??= draft;
  }
  if (firstFailure) return firstFailure;
  if (stdio.length) return no('unsupported_registry', String(stdio[0].registryType));
  if (remotes.some((r) => r.type === 'sse')) return no('legacy_sse_only', '');
  return no('no_endpoint', '');
}

// ---------------------------------------------------------------------------
// Hugging Face の MCP の Space、ACP の台帳
// ---------------------------------------------------------------------------

export type SpaceRecord = { id: string; sdk?: string; stage?: string; host?: string; likes?: number; lastModified?: string };
/** 動いている Gradio の Space だけ。寝ている物・止まっている物は下書きを作らない（起こさない）。 */
export async function draftFromSpace(space: SpaceRecord): Promise<NoahDraft> {
  if (space.sdk !== 'gradio' || space.stage !== 'RUNNING' || !space.host || !isNoahPublicHost(space.host)) return no('no_endpoint', space.stage ?? '');
  return finish({
    schema: 'noah-connect/1', candidateId: noahCandidateId('hf-mcp-space', space.id),
    candidateDigest: await sha256Hex(canonicalJson({ id: space.id, sdk: space.sdk, host: space.host })),
    mouth: 'space-mcp', surface: 'none', places: ['provider'], target: { spaceId: space.id, host: space.host },
    codeDelivery: 'none', model: { use: 'provider', needs: [], minContextTokens: 0 }, egress: [space.host],
    services: [], secrets: [], uses: [],
  }, []);
}
/** Space の MCP の接続先。握手は mcp-remote と同じ。 */
export const noahSpaceMcpUrl = (host: string) => `https://${host}/gradio_api/mcp/`;

export type AcpDistribution = {
  npx?: { package: string; args?: string[]; env?: Record<string, string> };
  uvx?: { package: string; args?: string[]; env?: Record<string, string> };
  binary?: Record<string, { archive: string; cmd: string; sha256: string; args?: string[]; env?: Record<string, string> }>;
};
export type AcpAgent = { id: string; name?: string; version?: string; distribution?: AcpDistribution };
/** ACP の台帳の 1 件。配布は npx → uvx → binary（端末の platform の物）の順で選ぶ。 */
export async function draftFromAcp(agent: AcpAgent, platform: 'linux-aarch64' | 'linux-x86_64'): Promise<NoahDraft> {
  const d = agent.distribution ?? {};
  const base = {
    schema: 'noah-connect/1', candidateId: noahCandidateId('acp-registry', agent.id),
    candidateDigest: await sha256Hex(canonicalJson(agent)),
    mouth: 'acp', surface: 'terminal', places: ['home'], codeDelivery: 'device_allowed',
    // ACP の Agent は提供元のモデルに固定の物が多い。台帳に宣言が無いので、本人の契約として扱う。
    model: { use: 'own_account', needs: [], minContextTokens: 0 }, egress: [], services: [], secrets: [], uses: [],
  };
  const fixed = (env?: Record<string, string>) => Object.entries(env ?? {}).map(([name, value]) => ({ name, value }));
  const some = d.npx ?? d.uvx;
  if (some) {
    const type = d.npx ? 'npm' : 'pypi';
    const cut = d.npx ? some.package.lastIndexOf('@') : some.package.indexOf('==');
    if (cut <= 0) return no('bad_identifier', some.package);
    const fixedEnv = fixed(some.env);
    return finish({ ...base, target: {
      registryType: type, identifier: some.package.slice(0, cut), version: some.package.slice(cut + (d.npx ? 1 : 2)),
      integrity: null, args: some.args ?? [], env: [], ...(fixedEnv.length ? { fixedEnv } : {}),
    } }, []);
  }
  const bin = d.binary?.[platform];
  if (!bin) return no('unsupported_registry', Object.keys(d.binary ?? {}).join(','));
  const fixedEnv = fixed(bin.env);
  return finish({ ...base, target: {
    registryType: 'binary', identifier: bin.archive, version: agent.version ?? '', integrity: `sha256:${bin.sha256}`,
    args: bin.args ?? [], command: bin.cmd, env: [], ...(fixedEnv.length ? { fixedEnv } : {}),
  } }, []);
}

// ---------------------------------------------------------------------------
// 名寄せ（系列）
// ---------------------------------------------------------------------------

export type NoahFamilyItem = {
  id: string;
  source: 'mcp-registry' | 'hf-mcp-space' | 'acp-registry' | 'discovery';
  /** 台帳の名前（`名前空間/名前`）、Space の id、ACP の id。 */
  name: string;
  /** 接続先の host。package は無い。 */
  host?: string;
  /** リポジトリの URL。 */
  repository?: string;
  /** L1 の後に分かる、道具の定義の hash。 */
  toolsSha256?: string;
  running?: boolean;
  level?: 0 | 1 | 2;
  likes?: number;
  updatedAt?: number;
};
/** 同じ提供者の量産と、同じ名前のコピーを 1 系列にまとめる件数（候補）。 */
export const NOAH_BULK_THRESHOLD = 20;

/** リポジトリの URL を、比べられる鍵にする。対応する host だけ。 */
export function noahRepositoryKey(url: string | undefined): string | null {
  const m = /^https:\/\/(github\.com|gitlab\.com|huggingface\.co)\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url ?? '');
  return m ? `${m[1]}/${m[2].toLowerCase()}` : null;
}
const spaceName = (id: string) => id.slice(id.indexOf('/') + 1).toLowerCase();
const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

/**
 * 系列の鍵を決める。規則は上から順に当て、最初に当たった物を採る。
 * 1) 台帳で、同じ名前空間かつ同じ host の記録が 20 件以上 → `bulk:名前空間@host`（量産）
 * 2) 台帳で、同じリポジトリの記録が 20 件以上 → `bulk:repo:…`（量産）
 * 3) 道具の定義の hash が同じで、リポジトリか host か Space の名前も同じ物が 2 件以上 → `same:hash16:…`（同じ物のコピー）
 * 4) 出どころが違い、リポジトリが同じで、どの出どころにも 1 件ずつ → `repo:…`（同じ物の別の載り方）
 * 5) Space で、小文字にした名前が同じ物が 20 件以上 → `space:名前`（教材などの写し）
 * 6) それ以外 → `出どころ:名前`（1 件で 1 系列）
 * 同じリポジトリの 2〜19 件は、別の道具のことが多いので、握手の前はまとめない（実測は仕様書 85）。
 */
export function groupNoahFamilies(items: NoahFamilyItem[]): { familyOf: Map<string, string>; representative: Map<string, string> } {
  const nsHost = new Map<string, number>();
  const registryRepo = new Map<string, number>();
  const repoSources = new Map<string, Map<string, number>>();
  const spaces = new Map<string, number>();
  const same = new Map<string, number>();
  const anchorOf = (i: NoahFamilyItem) =>
    i.source === 'hf-mcp-space' ? `space/${spaceName(i.name)}` : noahRepositoryKey(i.repository) ?? (i.host ? `host/${i.host}` : null);
  const sameKey = (i: NoahFamilyItem) => (i.toolsSha256 && anchorOf(i) ? `same:${i.toolsSha256.slice(0, 16)}:${anchorOf(i)}` : null);
  for (const i of items) {
    const repo = noahRepositoryKey(i.repository);
    if (i.source === 'mcp-registry' && i.host) bump(nsHost, `${i.name.split('/')[0]}@${i.host}`);
    if (i.source === 'mcp-registry' && repo) bump(registryRepo, repo);
    if (repo) {
      if (!repoSources.has(repo)) repoSources.set(repo, new Map());
      bump(repoSources.get(repo)!, i.source);
    }
    if (i.source === 'hf-mcp-space') bump(spaces, spaceName(i.name));
    const sk = sameKey(i);
    if (sk) bump(same, sk);
  }

  const familyOf = new Map<string, string>();
  for (const i of items) {
    const repo = noahRepositoryKey(i.repository);
    const ns = `${i.name.split('/')[0]}@${i.host}`;
    const sk = sameKey(i);
    const sources = repo ? repoSources.get(repo)! : null;
    let family: string;
    if (i.source === 'mcp-registry' && i.host && (nsHost.get(ns) ?? 0) >= NOAH_BULK_THRESHOLD) family = `bulk:${ns}`;
    else if (i.source === 'mcp-registry' && repo && (registryRepo.get(repo) ?? 0) >= NOAH_BULK_THRESHOLD) family = `bulk:repo:${repo}`;
    else if (sk && (same.get(sk) ?? 0) >= 2) family = sk;
    else if (repo && sources && sources.size >= 2 && [...sources.values()].every((n) => n === 1)) family = `repo:${repo}`;
    else if (i.source === 'hf-mcp-space' && (spaces.get(spaceName(i.name)) ?? 0) >= NOAH_BULK_THRESHOLD) family = `space:${spaceName(i.name)}`;
    else family = `${i.source}:${i.name}`;
    familyOf.set(i.id, family);
  }
  // 代表: 動いている → 接続試験が深い → いいねが多い → 更新が新しい → ID の順
  const better = (a: NoahFamilyItem, b: NoahFamilyItem) =>
    Number(b.running ?? false) - Number(a.running ?? false) || (b.level ?? 0) - (a.level ?? 0) ||
    (b.likes ?? 0) - (a.likes ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.id < b.id ? -1 : 1);
  const representative = new Map<string, string>();
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const i of items) {
    const family = familyOf.get(i.id)!;
    const current = representative.get(family);
    if (!current || better(i, byId.get(current)!) < 0) representative.set(family, i.id);
  }
  return { familyOf, representative };
}

// ---------------------------------------------------------------------------
// 接続試験 L2 の見本の入力、見回りの間隔
// ---------------------------------------------------------------------------

export type NoahProbeTool = { name: string; inputSchema: unknown; readOnly: boolean };
type Schema = { required?: unknown; properties?: Record<string, { default?: unknown; examples?: unknown; enum?: unknown; const?: unknown; type?: unknown }> };
const fillable = (p: { default?: unknown; examples?: unknown; enum?: unknown; const?: unknown } | undefined): { ok: boolean; value?: unknown } => {
  if (!p) return { ok: false };
  if (p.const !== undefined) return { ok: true, value: p.const };
  if (p.default !== undefined) return { ok: true, value: p.default };
  if (Array.isArray(p.examples) && p.examples.length) return { ok: true, value: p.examples[0] };
  if (Array.isArray(p.enum) && p.enum.length) return { ok: true, value: p.enum[0] };
  return { ok: false };
};
/**
 * 自動で呼んでよい道具と、その入力の候補を、試す順に返す。条件を満たさなければ空。
 * 条件: 全部の道具が読み取りだけと宣言されている。その道具の必須の入力が、定義（const・default・examples・enum）から全部埋まる。
 * 文字列を勝手に作って入れない。順は、必須の入力が少ない → 入力の項目が少ない → 名前の順。
 * 接続試験は、上から順に最大 limit 個を試し、最初に成功した物を見本にする。
 */
export function noahSampleCalls(tools: NoahProbeTool[], limit = 3): { tool: string; args: Record<string, unknown> }[] {
  if (!tools.length || tools.some((t) => !t.readOnly)) return [];
  const candidates: { tool: string; args: Record<string, unknown>; required: number; properties: number }[] = [];
  for (const t of tools) {
    const s = (t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : {}) as Schema;
    const required = Array.isArray(s.required) ? s.required.map(String) : [];
    const args: Record<string, unknown> = {};
    let ok = true;
    for (const key of required) {
      const f = fillable(s.properties?.[key]);
      if (!f.ok) { ok = false; break; }
      args[key] = f.value;
    }
    if (ok) candidates.push({ tool: t.name, args, required: required.length, properties: Object.keys(s.properties ?? {}).length });
  }
  candidates.sort((a, b) => a.required - b.required || a.properties - b.properties || (a.tool < b.tool ? -1 : 1));
  return candidates.slice(0, limit).map(({ tool, args }) => ({ tool, args }));
}

const HOUR = 3_600_000;
export const NOAH_CHECK_INTERVALS = { connected: 24 * HOUR, level2: 72 * HOUR, level1: 168 * HOUR, hideAfter: 30 * 24 * HOUR };
/**
 * 次に確かめる時刻。つないでいる人がいる系列は 24 時間後、L2 だけは 3 日後、L1 以下は 7 日後。
 * 失敗が続くと間隔を 2 倍ずつ伸ばす（最長 30 日）。hide は、最初の失敗から 30 日たったら真。
 */
export function nextNoahCheck(input: { now: number; connected: boolean; level: 0 | 1 | 2; failures: number; firstFailureAt: number | null }): { at: number; hide: boolean } {
  const base = input.connected ? NOAH_CHECK_INTERVALS.connected : input.level === 2 ? NOAH_CHECK_INTERVALS.level2 : NOAH_CHECK_INTERVALS.level1;
  const interval = Math.min(base * 2 ** Math.min(input.failures, 10), NOAH_CHECK_INTERVALS.hideAfter);
  return { at: input.now + interval, hide: input.firstFailureAt !== null && input.now - input.firstFailureAt >= NOAH_CHECK_INTERVALS.hideAfter };
}
