/**
 * Noah 接続要件 `noah-connect/1`・接続計画・接続の状態遷移・更新の差。
 *
 * Design contract only. No network calls, credentials or production mutations.
 * I/O を持たない純関数だけを置く（hash の計算に crypto.subtle を使う所を除く）。
 * 実装する時は lib/noah-connect-requirements.ts・lib/noah-connect-plan.ts へ移し、
 * docs/design-validation/noah/ の試験を tests/ へ移して同じ結果にする。
 * 仕様の本文は docs/noah/spec-96-connect-plan.md。
 */

export const NOAH_CONNECT_SCHEMA = 'noah-connect/1';

export const NOAH_PLACES = ['provider', 'home', 'cloud', 'pocket'] as const;
export type NoahPlace = (typeof NOAH_PLACES)[number];

export const NOAH_MOUTHS = ['mcp-remote', 'space-mcp', 'a2a', 'mcp-package', 'acp', 'source'] as const;
export type NoahMouthKind = (typeof NOAH_MOUTHS)[number];
/** 相手のサーバーで動く口。置き場所は provider だけ。面は none だけ。 */
export const NOAH_REMOTE_MOUTHS: readonly NoahMouthKind[] = ['mcp-remote', 'space-mcp', 'a2a'];

export const NOAH_SURFACES = ['none', 'terminal', 'browser', 'screen', 'own-device'] as const;
export type NoahSurface = (typeof NOAH_SURFACES)[number];

export type NoahHeader = {
  /** HTTP header の名前。 */
  name: string;
  required: boolean;
  secret: boolean;
  /** 秘密でない固定の値。台帳が literal で宣言した時だけ。 */
  value?: string;
  /** `Bearer {api_key}` のような型。値は Broker が入れる。 */
  template?: string;
};
export type NoahRemoteTarget = { url: string; headers: NoahHeader[] };
export type NoahSpaceTarget = { spaceId: string; host: string };
export type NoahA2aTarget = { cardUrl: string };
export type NoahPackageTarget = {
  /** binary は、台帳が URL と sha256 を固定した実行ファイルの archive。 */
  registryType: 'npm' | 'pypi' | 'oci' | 'binary';
  /** package の名前。oci は `host/path`。binary は archive の HTTPS の URL。 */
  identifier: string;
  /** 1 つに決まる版。oci は tag（空文字も可）。 */
  version: string;
  /** 取り込みで固定した中身の hash。`sha512-…`（npm）か `sha256:…`。固定の前は null。binary は必須。 */
  integrity: string | null;
  /** 起動の型紙が決めた、package へ渡す引数。 */
  args: string[];
  /** 起動する bin の名前。package の名前と違う時だけ。binary は必須。 */
  command?: string;
  /** PyPI の extras。 */
  extras?: string[];
  /** 環境変数の名前だけ。値は Broker が入れる。 */
  env: string[];
  /** 台帳が literal で宣言した、秘密でない環境変数。 */
  fixedEnv?: { name: string; value: string }[];
};
export type NoahSourceTarget = { runtime: 'recipe' | 'noah-terminal/1'; key: string };
export type NoahTarget =
  | NoahRemoteTarget
  | NoahSpaceTarget
  | NoahA2aTarget
  | NoahPackageTarget
  | NoahSourceTarget;

export type NoahService = {
  id: string;
  method: 'oauth' | 'official_login' | 'none';
  required: boolean;
  purpose: string;
};
export type NoahModelUse = 'none' | 'local' | 'relay' | 'provider' | 'own_account';

export type NoahConnect = {
  schema: typeof NOAH_CONNECT_SCHEMA;
  /** 載せた版を指す時。 */
  packageKey?: string;
  manifestSha256?: string;
  /** 取り込んだ物を指す時。 */
  candidateId?: string;
  candidateDigest?: string;
  mouth: NoahMouthKind;
  surface: NoahSurface;
  places: NoahPlace[];
  target: NoahTarget;
  codeDelivery: 'none' | 'cloud_only' | 'device_allowed';
  model: { use: NoahModelUse; needs: string[]; minContextTokens: number };
  egress: string[];
  services: NoahService[];
  /** 本人が自分で入力する物の名前。1 つでもあれば「準備が必要」。 */
  secrets: string[];
  uses: string[];
  try?: { input: string };
};

export class NoahConnectError extends Error {
  /** 機械が読む理由。画面には出さない。 */
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const KEYS = [
  'schema', 'packageKey', 'manifestSha256', 'candidateId', 'candidateDigest', 'mouth', 'surface',
  'places', 'target', 'codeDelivery', 'model', 'egress', 'services', 'secrets', 'uses', 'try',
];
const HEX64 = /^[a-f0-9]{64}$/;
/** 最後の label が英字で始まる。数字だけのアドレスはここで落ちる。 */
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const INNER_SUFFIXES = [
  'localhost', '.localhost', '.local', '.internal', '.lan', '.test', '.invalid', '.onion',
  '.home.arpa', '.example',
];
const HEADER_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** Noah の口が自分で付ける header。接続要件には書けない。台帳にあっても使わない。 */
export const NOAH_RESERVED_HEADERS: readonly string[] = [
  'host', 'content-length', 'content-type', 'accept', 'origin', 'cookie', 'connection',
  'transfer-encoding', 'mcp-session-id', 'mcp-protocol-version', 'user-agent',
];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const PYPI_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;
const PEP440 = /^\d+(?:\.\d+)*(?:(?:a|b|rc|\.post|\.dev)\d+)*$/;
const OCI_NAME = /^[a-z0-9.-]+(?::\d+)?\/[a-z0-9._/-]+$/;
const OCI_TAG = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const ARG = /^[A-Za-z0-9@%_+=:,./-]{1,200}$/;
const COMMAND = /^(?:\.\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,3}$/;
const INTEGRITY = /^(?:sha512-[A-Za-z0-9+/]{86}==|sha256:[a-f0-9]{64})$/;

/**
 * 秘密値らしい値。知られた接頭辞の後ろに 8 文字以上、または、区切りの無い英数字が 32 文字以上で
 * 英字と数字の両方を含む並び。パスや名前のように `-` `/` `.` で区切られた文字列は当たらない。
 */
const SECRET_PREFIX =
  /(?:^|[^A-Za-z0-9])(?:sk-|ghp_|gho_|github_pat_|xox[abp]-|AKIA|hf_|AIza|eyJ)[A-Za-z0-9_-]{8,}/;
const LONG_RUN = /[A-Za-z0-9]{32,}/g;
export function looksLikeNoahSecret(text: string): boolean {
  if (SECRET_PREFIX.test(text) || /bearer\s+[A-Za-z0-9._-]{12,}/i.test(text)) return true;
  for (const run of text.match(LONG_RUN) ?? []) if (/[A-Za-z]/.test(run) && /\d/.test(run)) return true;
  return false;
}

function fail(code: string, message: string): never {
  throw new NoahConnectError(code, message);
}
function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('shape', `${name} は object です。`);
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[], name: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('unknown_key', `${name} に未知の項目があります: ${key}`);
}
function text(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || !value || value.length > max) fail('shape', `${name} の形が違います。`);
  return value as string;
}
function array(value: unknown, max: number, name: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail('shape', `${name} は ${max} 個までの配列です。`);
  return value as unknown[];
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail('enum', `${name} の値が違います。`);
  return value as T;
}

/** 公開の host の名前か。数字のアドレス、内部向けの名前を拒否する。名前を引いた後の検査は口が行う。 */
export function isNoahPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  return HOST.test(h) && !INNER_SUFFIXES.some((s) => h === s.replace(/^\./, '') || h.endsWith(s));
}
/** 公開の HTTPS の URL だけを通す。`{name}` の差し込みはパスと query にだけ許す。 */
export function noahPublicHttpsUrl(raw: unknown, name = 'url'): URL {
  const value = text(raw, 500, name);
  let url: URL;
  try {
    url = new URL(value.replace(/\{[A-Za-z_][A-Za-z0-9_]{0,63}\}/g, 'x'));
  } catch {
    return fail('url', `${name} の形が違います。`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('url', `${name} は HTTPS の公開 URL です。`);
  if (value.slice(0, value.indexOf('/', 8) < 0 ? value.length : value.indexOf('/', 8)).includes('{')) fail('url', `${name} の host に差し込みは使えません。`);
  if (!isNoahPublicHost(url.hostname)) fail('url', `${name} は公開の host だけです。`);
  return url;
}

function parseTarget(mouth: NoahMouthKind, value: unknown): NoahTarget {
  const t = record(value, 'target');
  if (mouth === 'mcp-remote') {
    onlyKeys(t, ['url', 'headers'], 'target');
    noahPublicHttpsUrl(t.url, 'target.url');
    const headers = array(t.headers, 8, 'target.headers').map((raw, i) => {
      const h = record(raw, `target.headers[${i}]`);
      onlyKeys(h, ['name', 'required', 'secret', 'value', 'template'], `target.headers[${i}]`);
      const name = text(h.name, 64, 'header の名前');
      if (!HEADER_NAME.test(name) || NOAH_RESERVED_HEADERS.includes(name.toLowerCase())) fail('header', `この header は宣言できません: ${name}`);
      if (typeof h.required !== 'boolean' || typeof h.secret !== 'boolean') fail('shape', 'header の required・secret は真偽です。');
      if (h.value !== undefined) {
        if (h.secret) fail('secret', '秘密の header に固定の値は置けません。');
        text(h.value, 200, 'header の値');
      }
      if (h.template !== undefined && !/^[A-Za-z0-9 _-]{0,40}\{[A-Za-z_][A-Za-z0-9_]{0,63}\}$/.test(text(h.template, 120, 'header の型'))) fail('header', 'header の型は「接頭辞 {名前}」の形です。');
      return h as unknown as NoahHeader;
    });
    return { url: t.url as string, headers };
  }
  if (mouth === 'space-mcp') {
    onlyKeys(t, ['spaceId', 'host'], 'target');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(text(t.spaceId, 200, 'target.spaceId'))) fail('shape', 'target.spaceId の形が違います。');
    const host = text(t.host, 253, 'target.host');
    if (!isNoahPublicHost(host) || !host.endsWith('.hf.space')) fail('url', 'target.host は hf.space の host です。');
    return { spaceId: t.spaceId as string, host };
  }
  if (mouth === 'a2a') {
    onlyKeys(t, ['cardUrl'], 'target');
    noahPublicHttpsUrl(t.cardUrl, 'target.cardUrl');
    return { cardUrl: t.cardUrl as string };
  }
  if (mouth === 'source') {
    onlyKeys(t, ['runtime', 'key'], 'target');
    oneOf(t.runtime, ['recipe', 'noah-terminal/1'] as const, 'target.runtime');
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(text(t.key, 64, 'target.key'))) fail('shape', 'target.key の形が違います。');
    return { runtime: t.runtime as NoahSourceTarget['runtime'], key: t.key as string };
  }
  onlyKeys(t, ['registryType', 'identifier', 'version', 'integrity', 'args', 'command', 'extras', 'env', 'fixedEnv'], 'target');
  const type = oneOf(t.registryType, ['npm', 'pypi', 'oci', 'binary'] as const, 'target.registryType');
  const identifier = text(t.identifier, 500, 'target.identifier');
  const version = typeof t.version === 'string' && t.version.length <= 128 ? t.version : fail('shape', 'target.version は文字列です。');
  if (type === 'binary') noahPublicHttpsUrl(identifier, 'target.identifier');
  const good =
    type === 'npm' ? identifier.length <= 214 && NPM_NAME.test(identifier) && SEMVER.test(version)
    : type === 'pypi' ? PYPI_NAME.test(identifier) && (PEP440.test(version) || SEMVER.test(version))
    : type === 'oci' ? OCI_NAME.test(identifier) && (version === '' || OCI_TAG.test(version))
    : !identifier.includes('{') && (version === '' || OCI_TAG.test(version));
  if (!good) fail('identifier', '配布の識別子か版の形が、起動の型紙に合いません。');
  if (t.integrity !== null && !(typeof t.integrity === 'string' && INTEGRITY.test(t.integrity))) fail('integrity', 'target.integrity の形が違います。');
  if ((type === 'oci' || type === 'binary') && t.integrity !== null && !String(t.integrity).startsWith('sha256:')) fail('integrity', 'oci と binary の固定は sha256 です。');
  const args = array(t.args, 16, 'target.args').map((a) => (typeof a === 'string' && ARG.test(a) ? a : fail('arg', '引数の形が違います。')));
  const command = t.command === undefined ? undefined : text(t.command, 200, 'target.command');
  if (command !== undefined && (!COMMAND.test(command) || command.split('/').includes('..'))) fail('arg', 'target.command の形が違います。');
  if (type === 'binary' && (t.integrity === null || command === undefined)) fail('integrity', 'binary は、hash と起動する名前が必須です。');
  const fixedEnv = t.fixedEnv === undefined ? undefined : array(t.fixedEnv, 16, 'target.fixedEnv').map((raw, i) => {
    const e = record(raw, `target.fixedEnv[${i}]`);
    onlyKeys(e, ['name', 'value'], `target.fixedEnv[${i}]`);
    if (typeof e.name !== 'string' || !ENV_NAME.test(e.name) || typeof e.value !== 'string' || !ARG.test(e.value)) fail('env', '固定の環境変数の形が違います。');
    return { name: e.name as string, value: e.value as string };
  });
  if (t.extras !== undefined) {
    if (type !== 'pypi') fail('arg', 'extras は pypi だけです。');
    for (const e of array(t.extras, 8, 'target.extras')) if (typeof e !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(e)) fail('arg', 'extras の形が違います。');
  }
  const env = array(t.env, 32, 'target.env').map((e) => (typeof e === 'string' && ENV_NAME.test(e) ? e : fail('env', '環境変数の名前の形が違います。')));
  return {
    registryType: type, identifier, version, integrity: t.integrity as string | null, args,
    ...(command !== undefined ? { command } : {}),
    ...(t.extras !== undefined ? { extras: t.extras as string[] } : {}),
    env,
    ...(fixedEnv !== undefined ? { fixedEnv } : {}),
  };
}

/**
 * 接続要件に秘密値を書かせない。URL は公開の物なので、host は見ず、パスと query を接頭辞だけで見る
 * （ID のような長い英数字は通す）。hash の欄は除く。
 */
function refuseSecrets(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (value.startsWith('https://')) {
      const at = value.indexOf('/', 8);
      if (at >= 0 && SECRET_PREFIX.test(value.slice(at))) fail('secret', `${path} に秘密値らしい値があります。`);
      return;
    }
    const cleaned = value.replace(/sha512-[A-Za-z0-9+/]{86}==|sha256:[a-f0-9]{64}/g, '');
    if (looksLikeNoahSecret(cleaned)) fail('secret', `${path} に秘密値らしい値があります。`);
  } else if (Array.isArray(value)) value.forEach((x, i) => refuseSecrets(x, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, x] of Object.entries(value)) refuseSecrets(x, `${path}.${k}`);
}

/** 接続要件を検査して返す。合わない物は NoahConnectError（code 付き）。 */
export function parseNoahConnect(value: unknown): NoahConnect {
  const v = record(value, '接続要件');
  onlyKeys(v, KEYS, '接続要件');
  if (v.schema !== NOAH_CONNECT_SCHEMA) fail('schema', `schema は ${NOAH_CONNECT_SCHEMA} です。`);

  const byPackage = v.packageKey !== undefined || v.manifestSha256 !== undefined;
  const byCandidate = v.candidateId !== undefined || v.candidateDigest !== undefined;
  if (byPackage === byCandidate) fail('subject', 'packageKey と candidateId の、どちらか一方を指定します。');
  if (byPackage) {
    text(v.packageKey, 200, 'packageKey');
    if (!HEX64.test(String(v.manifestSha256))) fail('subject', 'manifestSha256 の形が違います。');
  } else {
    text(v.candidateId, 300, 'candidateId');
    if (!HEX64.test(String(v.candidateDigest))) fail('subject', 'candidateDigest の形が違います。');
  }

  const mouth = oneOf(v.mouth, NOAH_MOUTHS, 'mouth');
  const surface = oneOf(v.surface, NOAH_SURFACES, 'surface');
  const remote = NOAH_REMOTE_MOUTHS.includes(mouth);
  const places = array(v.places, 4, 'places').map((p) => oneOf(p, NOAH_PLACES, 'places'));
  if (!places.length || new Set(places).size !== places.length) fail('places', 'places は重複なしで 1 つ以上です。');
  if (remote && (places.length !== 1 || places[0] !== 'provider')) fail('places', '相手のサーバーで動く口の置き場所は provider だけです。');
  if (!remote && places.includes('provider')) fail('places', '端末で動く口に provider は置けません。');
  if (places.includes('pocket') && mouth !== 'source') fail('places', 'pocket は載せたコード（source）だけです。');
  if (remote !== (surface === 'none')) fail('surface', '面 none は、相手のサーバーで動く口だけです。');

  const target = parseTarget(mouth, v.target);
  const delivery = oneOf(v.codeDelivery, ['none', 'cloud_only', 'device_allowed'] as const, 'codeDelivery');
  if (remote !== (delivery === 'none')) fail('codeDelivery', 'codeDelivery none は、相手のサーバーで動く口だけです。');

  const m = record(v.model, 'model');
  onlyKeys(m, ['use', 'needs', 'minContextTokens'], 'model');
  const use = oneOf(m.use, ['none', 'local', 'relay', 'provider', 'own_account'] as const, 'model.use');
  for (const need of array(m.needs, 8, 'model.needs')) text(need, 80, 'model.needs');
  if (!Number.isInteger(m.minContextTokens) || (m.minContextTokens as number) < 0) fail('shape', 'model.minContextTokens は 0 以上の整数です。');
  if (use === 'own_account' && (places.length !== 1 || places[0] !== 'home')) fail('places', '本人の契約で動く物の置き場所は home だけです。');
  if (use === 'local' && places.some((p) => p !== 'home' && p !== 'pocket')) fail('places', '端末のモデルで動く物の置き場所は home か pocket です。');

  const egress = array(v.egress, 32, 'egress').map((h) => (typeof h === 'string' && isNoahPublicHost(h) ? h : fail('egress', 'egress は公開の host の名前だけです。')));
  if (mouth === 'mcp-remote' || mouth === 'space-mcp' || mouth === 'a2a') {
    const host =
      mouth === 'space-mcp' ? (target as NoahSpaceTarget).host
      : noahPublicHttpsUrl(mouth === 'a2a' ? (target as NoahA2aTarget).cardUrl : (target as NoahRemoteTarget).url).hostname;
    if (egress.length !== 1 || egress[0] !== host) fail('egress', '相手のサーバーで動く口の egress は、接続先の host 1 つです。');
  }

  const services = array(v.services, 16, 'services').map((raw, i) => {
    const s = record(raw, `services[${i}]`);
    onlyKeys(s, ['id', 'method', 'required', 'purpose'], `services[${i}]`);
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(text(s.id, 128, 'services.id'))) fail('shape', 'services.id の形が違います。');
    oneOf(s.method, ['oauth', 'official_login', 'none'] as const, 'services.method');
    if (typeof s.required !== 'boolean') fail('shape', 'services.required は真偽です。');
    text(s.purpose, 120, 'services.purpose');
    return s as unknown as NoahService;
  });
  if (new Set(services.map((s) => s.id)).size !== services.length) fail('shape', 'services.id が重複しています。');
  const secrets = array(v.secrets, 16, 'secrets').map((s) => text(s, 120, 'secrets'));
  const uses = array(v.uses, 16, 'uses').map((s) => text(s, 200, 'uses'));
  if (v.try !== undefined) {
    const t = record(v.try, 'try');
    onlyKeys(t, ['input'], 'try');
    text(t.input, 2000, 'try.input');
  }
  // 版・識別子・hash の欄は形の検査で足りる（git の hash を tag にする配布がある）。値を持てる欄だけを見る。
  const t = target as Partial<NoahRemoteTarget & NoahPackageTarget & NoahA2aTarget>;
  refuseSecrets({ url: t.url ?? t.cardUrl, headers: t.headers?.map((h) => h.value), args: t.args, fixedEnv: t.fixedEnv?.map((e) => e.value), try: v.try, uses }, '$');

  const out: NoahConnect = {
    schema: NOAH_CONNECT_SCHEMA,
    ...(byPackage
      ? { packageKey: v.packageKey as string, manifestSha256: v.manifestSha256 as string }
      : { candidateId: v.candidateId as string, candidateDigest: v.candidateDigest as string }),
    mouth, surface, places, target, codeDelivery: delivery,
    model: { use, needs: m.needs as string[], minContextTokens: m.minContextTokens as number },
    egress, services, secrets, uses,
    ...(v.try !== undefined ? { try: { input: (v.try as { input: string }).input } } : {}),
  };
  if (new TextEncoder().encode(canonicalJson(out)).byteLength > 16_384) fail('size', '接続要件は 16KB までです。');
  return out;
}

/** 鍵を並べ替えた JSON。同じ内容は必ず同じ文字列になる。undefined の項目は書かない。 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}
export async function sha256Hex(textValue: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(textValue));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const noahConnectSha256 = (connect: NoahConnect) => sha256Hex(canonicalJson(connect));

// ---------------------------------------------------------------------------
// 接続計画
// ---------------------------------------------------------------------------

export type NoahPlanState = {
  signedIn: boolean;
  /** その版への本人の利用権。owner は作者本人。 */
  entitlement: 'owner' | 'free' | 'paid' | 'trial' | 'none' | 'revoked';
  price: { model: 'free' | 'one_time'; amountMinor?: number; currency?: string };
  hasPaymentMethod: boolean;
  /** 本人が承認した端末。順は、本人が選んだ既定の端末が先。 */
  devices: { id: string; place: 'home' | 'pocket'; online: boolean }[];
  /** 雲の端末を使えるか（flag と本人の設定）。 */
  cloudEnabled: boolean;
  /** 本人の契約のログインが、家の端末で済んでいるか。 */
  ownAccountReady: boolean;
  /** 既に許可を持っているサービスの id。 */
  grantedServices: string[];
  /** サービスごとに、Noah が client として登録できるか。 */
  serviceRegistration: Record<string, 'available' | 'unavailable'>;
  /** 本人が前に同意した接続要件の hash。 */
  consentedSha256: string | null;
  /** 今の接続要件の hash。 */
  connectSha256: string;
  /** その版が宣言した権限。 */
  permissions: string[];
  preference: 'auto' | 'own_device' | 'cloud_only';
  /** 取り込んだ物の接続試験の深さ。載せた版には無い。 */
  intakeLevel?: 0 | 1 | 2;
};
export type NoahPlanStepKind =
  | 'account' | 'entitlement' | 'place' | 'runtime' | 'model' | 'services' | 'secrets' | 'consent';
export type NoahPlanStep = {
  kind: NoahPlanStepKind;
  /** auto: 何もしない。tap: 1 タップ。typed: 入力・導入・外での用意が要る。 */
  fill: 'auto' | 'tap' | 'typed';
  state: 'satisfied' | 'needed' | 'blocked';
  /** 足りない物の 1 行。画面にそのまま出す。 */
  label?: string;
  serviceId?: string;
};
export type NoahPlanBadge = 'one_click' | 'taps' | 'setup' | 'unverified' | 'blocked';
export type NoahPlan = {
  badge: NoahPlanBadge;
  cost: { taps: number; typed: number };
  place: NoahPlace | null;
  deviceId: string | null;
  steps: NoahPlanStep[];
  /** 最初に足りない物の 1 行。無ければ null。 */
  need: string | null;
  /** blocked の理由。 */
  reason?: string;
};

/** 追加の確認なしで通す権限。入力を受け取り、成果を返すだけの物。 */
export const NOAH_SILENT_PERMISSIONS: readonly string[] = ['read_user_input', 'write_results'];
/** 手数が同じ時の置き場所の順。 */
export const NOAH_PLACE_ORDER: readonly NoahPlace[] = ['provider', 'home', 'cloud', 'pocket'];

const done = (kind: NoahPlanStepKind): NoahPlanStep => ({ kind, fill: 'auto', state: 'satisfied' });
const need = (kind: NoahPlanStepKind, fill: 'tap' | 'typed', label: string, serviceId?: string): NoahPlanStep => ({
  kind, fill, state: 'needed', label, ...(serviceId ? { serviceId } : {}),
});

function stepsFor(req: NoahConnect, s: NoahPlanState, place: NoahPlace): { steps: NoahPlanStep[]; deviceId: string | null } {
  const steps: NoahPlanStep[] = [];
  steps.push(s.signedIn ? done('account') : need('account', 'tap', 'サインイン'));

  if (['owner', 'free', 'paid', 'trial'].includes(s.entitlement) || (s.entitlement === 'none' && s.price.model === 'free')) steps.push(done('entitlement'));
  else steps.push(s.hasPaymentMethod ? need('entitlement', 'tap', '購入') : need('entitlement', 'typed', '支払い方法の登録'));

  let deviceId: string | null = null;
  if (place === 'home' || place === 'pocket') {
    const mine = s.devices.filter((d) => d.place === place);
    const online = mine.find((d) => d.online);
    deviceId = online?.id ?? null;
    if (online) steps.push(done('place'));
    else steps.push(need('place', 'typed', mine.length ? '端末を動かす' : place === 'home' ? '端末を足す' : 'この端末で開く'));
  } else steps.push(done('place'));

  steps.push(done('runtime'));
  steps.push(req.model.use === 'own_account' && !s.ownAccountReady ? need('model', 'typed', '提供元のアカウントにログイン') : done('model'));

  for (const service of req.services) {
    if (!service.required || service.method === 'none' || s.grantedServices.includes(service.id)) continue;
    const tap = service.method === 'oauth' && s.serviceRegistration[service.id] === 'available';
    steps.push(need('services', tap ? 'tap' : 'typed', service.purpose, service.id));
  }
  if (!steps.some((x) => x.kind === 'services')) steps.push(done('services'));

  for (const name of req.secrets) steps.push(need('secrets', 'typed', `${name} を入力`));
  if (!req.secrets.length) steps.push(done('secrets'));

  const silent = s.price.model === 'free' && s.permissions.every((p) => NOAH_SILENT_PERMISSIONS.includes(p));
  steps.push(s.consentedSha256 === s.connectSha256 || silent ? done('consent') : need('consent', 'tap', '権限の確認'));
  return { steps, deviceId };
}

/** 接続要件と本人の今の状態から、足りない物と手数を計算する。権限も利用権も与えない。 */
export function planNoahConnection(req: NoahConnect, s: NoahPlanState): NoahPlan {
  const blocked = (reason: string): NoahPlan => ({
    badge: 'blocked', cost: { taps: 0, typed: 0 }, place: null, deviceId: null, steps: [], need: null, reason,
  });
  if (req.surface === 'own-device') return blocked('本人が使っている端末そのものを操作する物は、つなげません。');
  if (s.entitlement === 'revoked') return blocked('利用権が取り消されています。');

  const allowed = NOAH_PLACE_ORDER.filter((p) => {
    if (!req.places.includes(p)) return false;
    if (p === 'cloud') return s.cloudEnabled && s.preference !== 'own_device';
    if (p === 'home' || p === 'pocket') return s.preference !== 'cloud_only';
    return true;
  });
  if (!allowed.length) return blocked('この Agent が動ける置き場所が、今の設定にありません。');

  let best: { place: NoahPlace; deviceId: string | null; steps: NoahPlanStep[]; taps: number; typed: number } | null = null;
  for (const place of allowed) {
    const { steps, deviceId } = stepsFor(req, s, place);
    const taps = steps.filter((x) => x.state === 'needed' && x.fill === 'tap').length;
    const typed = steps.filter((x) => x.state === 'needed' && x.fill === 'typed').length;
    if (!best || typed < best.typed || (typed === best.typed && taps < best.taps)) best = { place, deviceId, steps, taps, typed };
  }
  const chosen = best!;
  const badge: NoahPlanBadge =
    chosen.typed > 0 ? 'setup'
    : s.intakeLevel !== undefined && s.intakeLevel < 2 ? 'unverified'
    : chosen.taps > 0 ? 'taps'
    : 'one_click';
  return {
    badge,
    cost: { taps: chosen.taps, typed: chosen.typed },
    place: chosen.place,
    deviceId: chosen.deviceId,
    steps: chosen.steps,
    need: chosen.steps.find((x) => x.state === 'needed')?.label ?? null,
  };
}

/** 計画の hash。client が見た計画と、接続の時の計画が同じかを確かめるのに使う。 */
export const noahPlanSha256 = (plan: NoahPlan, connectSha256: string, price: NoahPlanState['price']) =>
  sha256Hex(canonicalJson({ connectSha256, price, place: plan.place, deviceId: plan.deviceId, badge: plan.badge, steps: plan.steps }));

// ---------------------------------------------------------------------------
// 接続の状態遷移（noah_connections.state）
// ---------------------------------------------------------------------------

export const NOAH_CONNECTION_STATES = [
  'planned', 'entitling', 'preparing', 'probing', 'needs_action', 'connected', 'failed', 'unknown', 'blocked', 'disconnected',
] as const;
export type NoahConnectionState = (typeof NOAH_CONNECTION_STATES)[number];
export const NOAH_CONNECTION_EVENTS = [
  'entitle_start', 'entitle_ok', 'entitle_needs_action', 'entitle_revoked', 'prepare_ok', 'prepare_needs_action',
  'prepare_failed', 'probe_ok', 'probe_failed', 'probe_unknown', 'resume', 'retry', 'reconciled_ok',
  'reconciled_failed', 'tools_changed', 'revoked', 'disconnect',
] as const;
export type NoahConnectionEvent = (typeof NOAH_CONNECTION_EVENTS)[number];

const TRANSITIONS: Record<NoahConnectionState, Partial<Record<NoahConnectionEvent, NoahConnectionState>>> = {
  planned: { entitle_start: 'entitling' },
  entitling: { entitle_ok: 'preparing', entitle_needs_action: 'needs_action', entitle_revoked: 'blocked' },
  preparing: { prepare_ok: 'probing', prepare_needs_action: 'needs_action', prepare_failed: 'failed' },
  probing: { probe_ok: 'connected', probe_failed: 'failed', probe_unknown: 'unknown' },
  needs_action: { resume: 'planned' },
  connected: { tools_changed: 'needs_action', revoked: 'blocked' },
  failed: { retry: 'planned' },
  unknown: { reconciled_ok: 'connected', reconciled_failed: 'failed' },
  blocked: {},
  disconnected: {},
};
/** 次の状態を返す。決まっていない組み合わせは null（呼び出し側は 409 を返す）。切るのは、切った後を除いて、いつでもできる。 */
export function nextNoahConnectionState(state: NoahConnectionState, event: NoahConnectionEvent): NoahConnectionState | null {
  if (event === 'disconnect') return state === 'disconnected' ? null : 'disconnected';
  return TRANSITIONS[state][event] ?? null;
}
/** 「頼む」を受け付けてよい状態。 */
export const noahConnectionUsable = (state: NoahConnectionState) => state === 'connected';

// ---------------------------------------------------------------------------
// 更新の差（入れ替える）
// ---------------------------------------------------------------------------

export type NoahConnectDiff = { changed: string[]; reconsent: boolean };
/** 聞き直しが要る項目。どれかが変わった更新は、自動で入れない。 */
export const NOAH_RECONSENT_FIELDS: readonly string[] = ['mouth', 'surface', 'places', 'target', 'egress', 'services', 'secrets', 'model'];
export function diffNoahConnect(prev: NoahConnect, next: NoahConnect): NoahConnectDiff {
  const fields = ['mouth', 'surface', 'places', 'target', 'codeDelivery', 'model', 'egress', 'services', 'secrets', 'uses', 'try'] as const;
  const stable = (c: NoahConnect, f: (typeof fields)[number]) =>
    f === 'target' && 'integrity' in c.target ? canonicalJson({ ...c.target, version: '', integrity: null }) : canonicalJson(c[f]);
  const changed = fields.filter((f) => stable(prev, f) !== stable(next, f));
  return { changed, reconsent: changed.some((f) => NOAH_RECONSENT_FIELDS.includes(f)) };
}
