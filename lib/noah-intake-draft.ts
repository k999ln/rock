/**
 * Noah 取り込み: 公式台帳（MCP Registry）の 1 件 → 接続要件の下書き。台帳の読み方（最初は全件。その後は、更新された物だけ）。
 *
 * ここの関数は、通信も保存もしない。何も実行しない。台帳の「型の付いた項目」だけを読み、説明文は読まない。
 * 仕様: docs/noah/spec-85-intake.md（ローンチの範囲は 11 章）。docs/contracts/noah-intake-v1.ts から、関数ごと移した（L3）。
 */
import {
  canonicalJson,
  looksLikeNoahSecret,
  NOAH_RESERVED_HEADERS,
  NoahConnectError,
  noahPublicHttpsUrl,
  parseNoahConnect,
  sha256Hex,
  type NoahConnect,
  type NoahHeader,
  type NoahPackageTarget,
} from './noah-connect-requirements.ts';

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
// 公式台帳の読み方（最初は全件。その後は、更新された物だけ）
// 出どころの決まり: https://modelcontextprotocol.io/registry/registry-aggregators
// 2026-11-20 に確かめた: /v0.1/servers が limit・cursor・version=latest・updated_since を受ける。
// 直前の 1 時間に更新された記録は 109 件（2 頁）。その中に、status が deleted の記録が入る。
// ---------------------------------------------------------------------------

export const NOAH_REGISTRY = {
  base: 'https://registry.modelcontextprotocol.io',
  pageSize: 100,
  /** 更新された物だけを読む時、前回の印からさかのぼる幅（境目の取りこぼしを防ぐ）。 */
  overlapMs: 10 * 60_000,
  /** 更新された物だけを読む間隔。出どころの決まりは「1 時間に 1 回ほど」。 */
  everyMs: 60 * 60_000,
  /** 全件を読み直す間隔（取り下げの確かめと、取りこぼしの保険）。 */
  fullEveryMs: 7 * 24 * 60 * 60_000,
};

/** 1 頁を読む URL。updatedSince は、1 巡の間ずっと同じ値を使う（頁をまたいで変えない）。 */
export function noahRegistryPageUrl(input: { cursor?: string | null; updatedSince?: number | null }): string {
  const url = new URL('/v0.1/servers', NOAH_REGISTRY.base);
  url.searchParams.set('limit', String(NOAH_REGISTRY.pageSize));
  url.searchParams.set('version', 'latest');
  if (input.updatedSince) url.searchParams.set('updated_since', new Date(input.updatedSince).toISOString());
  if (input.cursor) url.searchParams.set('cursor', input.cursor);
  return url.toString();
}

/**
 * 次の巡回の読み方を決める。全件を読むのは、最初の 1 回と、前の全件から 7 日たった時。それ以外は、更新された物だけ。
 * 印（checkpoint）は、巡回を始めた時刻。全部の頁を書き終えた後にだけ進める（途中で止まったら、同じ印からやり直す）。
 */
export function noahRegistrySyncPlan(input: { now: number; checkpoint: number | null; lastFullAt: number | null }): { mode: 'full' | 'updated'; updatedSince: number | null; nextCheckpoint: number } {
  const full = input.checkpoint === null || input.lastFullAt === null || input.now - input.lastFullAt >= NOAH_REGISTRY.fullEveryMs;
  return { mode: full ? 'full' : 'updated', updatedSince: full ? null : input.checkpoint! - NOAH_REGISTRY.overlapMs, nextCheckpoint: input.now };
}

/** 台帳の status を、候補の状態にする。active 以外（deprecated・deleted）は取り下げ。deleted は、台帳の運営が外した物（迷惑・悪意・違法の疑い）。 */
export function noahRegistryState(status: unknown): 'active' | 'withdrawn' {
  return status === 'active' ? 'active' : 'withdrawn';
}
