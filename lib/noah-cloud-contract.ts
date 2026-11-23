/** Operator-reviewed distributions only. Catalog prose never becomes an executable command. */
export const NOAH_CLOUD_PROFILES = {
  hermes: {
    name: 'Hermes Agent', repository: 'https://github.com/NousResearch/hermes-agent', version: '0.19.0',
    package: 'hermes-agent', sha256: 'bd0bac012aee38a60894781f4597dc29ee7bedb3448540249921f10d3bef327f',
    description: '公式Hermesで計画を作り、依頼した情報を整理して保存します。記憶はこの依頼の中だけで使います。シェル実行や外部サイトの操作には対応していません。',
  },
  boss: {
    name: 'boss-agent-cli', repository: 'https://github.com/can4hou6joeng4/boss-agent-cli', version: '3.4.151',
    package: 'boss-agent-cli', sha256: '7d4b8834ab195964167c4dd8b07df82e4cc83c7f801124307ff8f386bbc4bef4',
    description: '入力した求人票から公式bossで面接の準備と質問5件を作成します。求人検索・応募には対応していません。',
  },
  time: {
    name: 'Time', repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time', version: '2026.11.18',
    package: 'mcp-server-time', sha256: 'acb3ba2e0faf812ce49989fbe74d363501cf7720c8d7a103debef9815e838a34',
    aliases: ['https://hub.docker.com/r/mcp/time', 'https://pypi.org/project/mcp-server-time'],
    description: '公式Time MCPで現在時刻とタイムゾーンを確認・変換します。端末の設定は不要です。',
  },
  thinking: {
    name: 'Sequential Thinking', repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking', version: '2.2.0',
    package: '@modelcontextprotocol/server-sequential-thinking', sha256: '7179c26a1a9fe99769832daeb41477cdd1e80f6e2d0301528c5b39888becd22d',
    aliases: ['https://hub.docker.com/r/mcp/sequentialthinking', 'https://www.npmjs.com/package/@modelcontextprotocol/server-sequential-thinking'],
    description: '公式Sequential Thinking MCPで課題を段階に分け、実行案をまとめます。依頼ごとに独立した環境で処理します。',
  },
  memory: {
    name: 'Memory', repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory', version: '2.2.1',
    package: '@modelcontextprotocol/server-memory', sha256: '95edf215d0a23f40e20581d6cd0ca46c0c6be85d7bdfa1dcb4c20662a0fbca2d',
    aliases: ['https://hub.docker.com/r/mcp/memory', 'https://www.npmjs.com/package/@modelcontextprotocol/server-memory'],
    description: '依頼した情報を公式Memory MCPで整理し、関係をファイルに保存します。記憶はこの依頼の中だけで使い、次回には引き継ぎません。',
  },
  filesystem: {
    name: 'Filesystem', repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', version: '2.4.0',
    package: '@modelcontextprotocol/server-filesystem', sha256: 'a785e3dadbf58a5fce6fbb006b883c925772c254e880da4866a4c418fc746e3f',
    aliases: ['https://hub.docker.com/r/mcp/filesystem', 'https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem'],
    description: '公式Filesystem MCPで文章やコードのファイルを作成・整理します。この依頼専用の作業場所を使い、端末のファイルにはアクセスしません。',
  },
} as const;
export type NoahCloudProfile = keyof typeof NOAH_CLOUD_PROFILES;
export const NOAH_FREE_CLOUD_PROFILES: readonly NoahCloudProfile[] = ['memory', 'thinking', 'filesystem', 'time', 'boss', 'hermes'];
export function noahCloudSupported(mode?: string): readonly NoahCloudProfile[] {
  return mode === 'free' ? NOAH_FREE_CLOUD_PROFILES : Object.keys(NOAH_CLOUD_PROFILES) as NoahCloudProfile[];
}
/**
 * 無料のクラウドは、件数ではなく、モデルを使った量（Workers AI の neuron）で数える（2026-11-24。本人「クラウドのシステム作って」
 * 「cloudflareでいいから最初は」、Workers Paid はまだ申し込まない、払い方は Agent の利益から差し引く）。
 * Workers AI の無料の割当は 1 日 10,000 neuron（UTC 0 時に戻る。アカウント全体で共有）。ほかの仕組みの分を残して、
 * クラウドの Agent には既定で 8,000 まで（Worker の環境変数 NOAH_CLOUD_DAILY_NEURONS で下げられる）。
 * 1 件は最大 jobNeurons まで（受け付ける時に、その分を取り置く。モデルを呼ぶ前に、入力のバイト数を上限のトークン数として確かめる）。
 * 1 人の 1 日は ownerDailyNeurons まで（ふつうの依頼で 7〜10 件）。件数の上限は、安全のための 2 つ目の柵として残す。
 */
export const NOAH_FREE_CLOUD_LIMITS = Object.freeze({ dailyJobs: 60, ownerDailyJobs: 12, modelCalls: 4, outputTokens: 1024, modelInputBytes: 32768, dailyNeurons: 8000, ownerDailyNeurons: 2400, jobNeurons: 1200 });
/** gpt-oss-20b の neuron（100 万トークンあたり）。https://developers.cloudflare.com/workers-ai/platform/pricing/ （2026-11-24 に確かめた） */
export const NOAH_CLOUD_NEURONS = Object.freeze({ inputPerMillion: 18182, outputPerMillion: 27273, usdPerThousand: 0.011 });
/** 使ったトークンの neuron（切り上げ）。 */
export function noahCloudNeurons(inputTokens: number, outputTokens: number): number {
  const input = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0, output = Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;
  return Math.ceil((input * NOAH_CLOUD_NEURONS.inputPerMillion + output * NOAH_CLOUD_NEURONS.outputPerMillion) / 1e6);
}
/** モデルを呼ぶ前の、その 1 回の最大の neuron（トークンは 1 バイト以上なので、入力のバイト数を上限にする）。 */
export const noahCloudCallNeuronsCap = (inputBytes: number, maxOutputTokens: number) => noahCloudNeurons(inputBytes, maxOutputTokens);
/** モデルの応答の usage から、使ったトークンを読む。無い・おかしい時は、呼ぶ前の上限で数える（少なく数えない）。 */
export function noahCloudReplyUsage(reply: unknown, inputBytes: number, maxOutputTokens: number): { inputTokens: number; outputTokens: number; neurons: number } {
  const usage = (reply as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  const inputTokens = ok(usage?.prompt_tokens) ? usage.prompt_tokens : inputBytes;
  const outputTokens = ok(usage?.completion_tokens) ? usage.completion_tokens : maxOutputTokens;
  return { inputTokens, outputTokens, neurons: noahCloudNeurons(inputTokens, outputTokens) };
}
/** 1 日の neuron の上限（環境変数で下げるだけ。上げる事はできない）。 */
export function noahCloudDailyNeurons(configured: unknown): number {
  const n = typeof configured === 'string' && /^\d{1,6}$/.test(configured) ? Number(configured) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n < NOAH_FREE_CLOUD_LIMITS.dailyNeurons ? n : NOAH_FREE_CLOUD_LIMITS.dailyNeurons;
}
/** 無料の割当が戻る時刻（次の UTC 0 時）を、日本時間の「何時」で言う。 */
export const NOAH_CLOUD_RESET_TEXT = '日本時間の朝 9 時';
export const NOAH_CLOUD_LIMITS = Object.freeze({ seconds: 240, modelCalls: 8, promptBytes: 12000, outputBytes: 131072, modelInputBytes: 131072, outputTokens: 2048, files: 12, fileBytes: 32768, totalFileBytes: 65536, dailyJobs: 50, ownerDailyJobs: 10, concurrent: 2 });
export const NOAH_CLOUD_MODEL = '@cf/openai/gpt-oss-20b';
export function noahCloudProfile(repository: string): NoahCloudProfile | null {
  const normalized = repository.replace(/\.git\/?$/, '').replace(/\/$/, '').toLowerCase();
  return (Object.keys(NOAH_CLOUD_PROFILES) as NoahCloudProfile[]).find(key => {
    const profile = NOAH_CLOUD_PROFILES[key];
    return [profile.repository, ...('aliases' in profile ? profile.aliases : [])].some(url => url.toLowerCase() === normalized);
  }) ?? null;
}
export const noahCloudId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export type NoahCloudFile = { name: string; base64: string; bytes: number; sha256: string };
export type NoahCloudResult = { text: string; files: NoahCloudFile[]; exitCode: number; calls: number };
export type NoahCloudJob = { id: string; profile: NoahCloudProfile; version: string; distribution: string; mode: 'probe' | 'run'; state: 'queued' | 'running' | 'returned' | 'failed' | 'cancelled' | 'unknown'; createdAt: number; deadlineAt: number; completedAt?: number; result?: NoahCloudResult; error?: string; calls: number; usage?: NoahCloudUsage };
/** 1 件で使ったモデルの量（無料のクラウドで数える。有料の Containers 版はまだ数えない）。 */
export type NoahCloudUsage = { inputTokens: number; outputTokens: number; neurons: number };
/** 実行器から届いた usage を確かめる（おかしければ null。結果そのものは捨てない）。 */
export function noahCloudUsageOf(value: unknown): NoahCloudUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { inputTokens, outputTokens, neurons } = value as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 10_000_000;
  return ok(inputTokens) && ok(outputTokens) && ok(neurons) ? { inputTokens, outputTokens, neurons } : null;
}
/** 表示だけに使う、1 ドルの円（約）。docs/compute-placement.md の 3 章と同じく、決済の計算には使わない。 */
export const NOAH_CLOUD_YEN_PER_USD = 157;
/** 有料プラン（Workers Paid）の値段で数えた時の、その件のモデル代（円、小数 1 桁）。無料の枠の中なら、今の請求は 0。 */
export const noahCloudListYen = (usage: NoahCloudUsage) => Math.round(usage.neurons / 1000 * NOAH_CLOUD_NEURONS.usdPerThousand * NOAH_CLOUD_YEN_PER_USD * 10) / 10;

export type NoahCloudConnection = { id: string; profile: NoahCloudProfile; state: 'preparing' | 'connected' | 'failed' | 'disconnected'; revision: number; probeId: string; activeJob: string | null; jobs: string[]; error?: string };
export async function noahCloudDigest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export function noahCloudModelInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || new TextEncoder().encode(JSON.stringify(value)).length > NOAH_CLOUD_LIMITS.modelInputBytes) throw Error('モデル入力が上限を超えました。');
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) throw Error('モデル入力を確認できません。');
  const messages = body.messages.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('モデル入力を確認できません。');
    const m = raw as Record<string, unknown>;
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(String(m.role)) || m.content !== null && typeof m.content !== 'string') throw Error('テキストのモデル入力だけを利用できます。');
    // Workers AI can return null for tool-only replies, but requires text on the next input.
    return { role: m.role === 'developer' ? 'system' : m.role, content: m.content ?? '', ...(typeof m.tool_call_id === 'string' ? { tool_call_id: m.tool_call_id } : {}), ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls } : {}) };
  });
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 32 || body.tools.some(t => !t || t.type !== 'function' || typeof t.function?.name !== 'string'))) throw Error('モデルの操作定義を確認できません。');
  // Do not forward a guest's model, endpoint, authorization, stream, or token limit.
  return { messages, ...(Array.isArray(body.tools) ? { tools: body.tools } : {}), max_tokens: NOAH_CLOUD_LIMITS.outputTokens, stream: false };
}
export async function noahCloudResult(value: unknown, calls: number): Promise<NoahCloudResult> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('実行結果を確認できません。');
  const v = value as Record<string, unknown>;
  if (v.type !== 'result' || !Number.isInteger(v.exitCode) || typeof v.text !== 'string' || !Array.isArray(v.files) || v.files.length > NOAH_CLOUD_LIMITS.files || new TextEncoder().encode(JSON.stringify(v)).length > NOAH_CLOUD_LIMITS.outputBytes) throw Error('実行結果が上限または形式に一致しません。');
  const names = new Set<string>(); let total = 0;
  const files: NoahCloudFile[] = [];
  for (const file of v.files) {
    if (!file || typeof file.name !== 'string' || file.name.length > 180 || !/^[\p{L}\p{N}\p{M}_./ -]+$/u.test(file.name) || file.name.split('/').some((p: string) => !p || p === '.' || p === '..') || names.has(file.name) || typeof file.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) throw Error('成果ファイルを確認できません。');
    const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)); total += bytes.length;
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (bytes.length !== file.bytes || bytes.length > NOAH_CLOUD_LIMITS.fileBytes || total > NOAH_CLOUD_LIMITS.totalFileBytes || file.sha256 !== digest) throw Error('成果ファイルが保存記録と一致しません。');
    names.add(file.name); files.push({ name: file.name, base64: file.base64, bytes: file.bytes, sha256: file.sha256 });
  }
  return { text: v.text, files, exitCode: v.exitCode as number, calls };
}
