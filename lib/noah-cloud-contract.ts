/** Operator-reviewed distributions only. Catalog prose never becomes an executable command. */
export const NOAH_CLOUD_PROFILES = {
  hermes: {
    name: 'Hermes Agent', repository: 'https://github.com/NousResearch/hermes-agent', version: '0.19.0',
    package: 'hermes-agent', sha256: 'bd0bac012aee38a60894781f4597dc29ee7bedb3448540249921f10d3bef327f',
    description: '文章・コード・ファイルの作成をNoahのクラウドで実行します。',
  },
  boss: {
    name: 'boss-agent-cli', repository: 'https://github.com/can4hou6joeng4/boss-agent-cli', version: '3.4.151',
    package: 'boss-agent-cli', sha256: '7d4b8834ab195964167c4dd8b07df82e4cc83c7f801124307ff8f386bbc4bef4',
    description: '入力した求人票から面接の準備と質問を作成します。求人検索・応募には求人サービスの本人認証が必要です。',
  },
} as const;
export type NoahCloudProfile = keyof typeof NOAH_CLOUD_PROFILES;
export const NOAH_CLOUD_LIMITS = Object.freeze({ seconds: 240, modelCalls: 8, promptBytes: 12000, outputBytes: 131072, modelInputBytes: 131072, outputTokens: 2048, files: 12, fileBytes: 32768, totalFileBytes: 65536, dailyJobs: 50, ownerDailyJobs: 10, concurrent: 2 });
export const NOAH_CLOUD_MODEL = '@cf/openai/gpt-oss-20b';
export function noahCloudProfile(repository: string): NoahCloudProfile | null {
  const normalized = repository.replace(/\.git\/?$/, '').replace(/\/$/, '').toLowerCase();
  return (Object.keys(NOAH_CLOUD_PROFILES) as NoahCloudProfile[]).find(key => NOAH_CLOUD_PROFILES[key].repository.toLowerCase() === normalized) ?? null;
}
export const noahCloudId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export type NoahCloudFile = { name: string; base64: string; bytes: number; sha256: string };
export type NoahCloudResult = { text: string; files: NoahCloudFile[]; exitCode: number; calls: number };
export type NoahCloudJob = { id: string; profile: NoahCloudProfile; version: string; distribution: string; mode: 'probe' | 'run'; state: 'queued' | 'running' | 'returned' | 'failed' | 'cancelled' | 'unknown'; createdAt: number; deadlineAt: number; completedAt?: number; result?: NoahCloudResult; error?: string; calls: number };
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
    return { role: m.role === 'developer' ? 'system' : m.role, content: m.content, ...(typeof m.tool_call_id === 'string' ? { tool_call_id: m.tool_call_id } : {}), ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls } : {}) };
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
