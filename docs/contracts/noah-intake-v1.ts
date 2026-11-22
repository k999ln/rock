import { canonicalJson, isNoahPublicHost, NoahConnectError, parseNoahConnect, sha256Hex } from './noah-connect-v1.ts';
import { noahCandidateId, type NoahDraft, type NoahIntakeReason } from '../../lib/noah-intake-draft.ts';
import { NOAH_BULK_THRESHOLD } from '../../lib/noah-intake-family.ts';
export * from '../../lib/noah-intake-draft.ts';
export * from '../../lib/noah-intake-family.ts';
export * from '../../lib/noah-intake-listing.ts';
export * from '../../lib/noah-intake-wake.ts';
const no = (reason: NoahIntakeReason, detail: string): NoahDraft => ({ ok: false, reason, detail });
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

// 見回りの間隔（NOAH_CHECK_INTERVALS・NOAH_FAILURES_TO_UNLIST・nextNoahCheck）と、握手 1 回（probeL1）・握手の結果の書き方（planNoahProbeWrite）は、
// lib/noah-probe.ts へ移した（MVP L4）。
export * from '../../lib/noah-probe.ts';

