/** Public Gradio transport. Only official HF identities and their fixed hf.space origin are used. */
import { noahSha256, NoahAgentError } from './noah-agent-upload.ts';
import type { NoahToolForm } from './noah-form.ts';
import {
  noahRasterMime,
  type NoahReceivedResult,
} from './noah-result-media.ts';
export type ProviderField = {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'boolean' | 'choice' | 'fixed' | 'list';
  optional: boolean;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  value?: unknown;
  choices?: (string | number | boolean)[];
  itemKind?: 'text' | 'number';
};
export type ProviderEndpoint = {
  name: string;
  label: string;
  description?: string;
  digest: string;
  fields: ProviderField[];
  form?: Extract<NoahToolForm, { usable: true }>;
  toolDigest?: string;
};
export type ProviderPlan = {
  protocol?: 'gradio' | 'mcp';
  projectId: string;
  name: string;
  repository: string;
  host: string;
  prefix: '' | '/gradio_api';
  endpoints: ProviderEndpoint[];
};
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const error = (s: string, status = 422): never => {
  throw new NoahAgentError(s, status);
};
export function providerHttpError(status: number) {
  return status === 401 || status === 403
    ? '提供元の認証・利用許可が必要です。'
    : status === 402
      ? '提供元で支払いが必要です。自動では支払いません。'
      : status === 429
        ? '提供元が混み合っています。時間をおいて、新しい依頼としてお試しください。'
        : '提供元の実行APIに接続できませんでした。';
}
export async function providerBytes(
  response: Response,
  limit = 1_048_576,
): Promise<Uint8Array> {
  if (!response.ok) {
    await response.body?.cancel();
    error(providerHttpError(response.status), 502);
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) error('提供元の応答が保存上限を超えています。', 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function readJson(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const r = await fetcher(url, {
    redirect: 'manual',
    signal,
    headers: { Accept: 'application/json' },
  });
  try {
    return JSON.parse(new TextDecoder().decode(await providerBytes(r)));
  } catch (e) {
    if (e instanceof NoahAgentError) throw e;
    return error('提供元のAPI定義を読み取れませんでした。', 502);
  }
}
export async function providerOrigin(
  repository: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<string> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    return error('Agentの提供元を確認できません。');
  const info = await readJson(
    `https://huggingface.co/api/spaces/${repository.split('/').map(encodeURIComponent).join('/')}`,
    fetcher,
    signal,
  );
  if (
    !object(info) ||
    typeof info.id !== 'string' ||
    info.id.toLowerCase() !== repository.toLowerCase() ||
    info.private !== false ||
    info.gated ||
    info.disabled ||
    info.sdk !== 'gradio' ||
    typeof info.host !== 'string'
  )
    return error('このAgentには公開Gradio実行APIがありません。');
  const u = new URL(info.host);
  if (
    u.protocol !== 'https:' ||
    !/^[a-z0-9][a-z0-9-]*\.hf\.space$/.test(u.hostname) ||
    u.port ||
    u.username ||
    u.password ||
    u.pathname !== '/' ||
    u.search ||
    u.hash
  )
    return error('実行先を確認できません。');
  if (
    !object(info.runtime) ||
    !['RUNNING', 'SLEEPING'].includes(String(info.runtime.stage))
  )
    return error('提供元の実行環境は停止中、または準備中です。', 503);
  return u.origin;
}
function field(value: unknown): ProviderField | null {
  if (
    !object(value) ||
    typeof value.parameter_name !== 'string' ||
    !/^[A-Za-z_]\w{0,79}$/.test(value.parameter_name) ||
    /password|api_?key|access_?token|secret|credential|authorization/i.test(
      value.parameter_name,
    ) ||
    !object(value.type)
  )
    return null;
  const name = value.parameter_name,
    label = typeof value.label === 'string' ? value.label.slice(0, 100) : name,
    schema = value.type;
  const optional = value.parameter_has_default === true,
    def = value.parameter_default;
  const base = { name, label, optional, ...(optional ? { value: def } : {}) };
  // A fresh conversation has no history and an unprovided media input is null, never a supplied URL/path.
  if (value.component === 'Chatbot' && Array.isArray(def) && def.length === 0)
    return { ...base, kind: 'fixed', value: [] };
  if (
    ['Image', 'Audio', 'File', 'Video'].includes(String(value.component)) &&
    def === null
  )
    return { ...base, kind: 'fixed', value: null };
  const choices = Array.isArray(schema.enum) ? schema.enum : undefined;
  if (
    choices &&
    choices.length > 0 &&
    choices.length <= 100 &&
    choices.every((v) => ['string', 'number', 'boolean'].includes(typeof v))
  )
    return { ...base, kind: 'choice', choices };
  if (schema.type === 'string' && (!optional || typeof def === 'string'))
    return { ...base, kind: 'text' };
  if (
    ['number', 'integer'].includes(String(schema.type)) &&
    (!optional || typeof def === 'number')
  )
    return {
      ...base,
      kind: 'number',
      integer: schema.type === 'integer',
      ...(typeof schema.minimum === 'number'
        ? { minimum: schema.minimum }
        : {}),
      ...(typeof schema.maximum === 'number'
        ? { maximum: schema.maximum }
        : {}),
    };
  if (schema.type === 'boolean' && (!optional || typeof def === 'boolean'))
    return { ...base, kind: 'boolean' };
  return null;
}
export async function providerEndpoints(
  info: unknown,
): Promise<ProviderEndpoint[]> {
  if (!object(info) || !object(info.named_endpoints)) return [];
  const endpoints: ProviderEndpoint[] = [];
  for (const [name, value] of Object.entries(info.named_endpoints).slice(
    0,
    100,
  )) {
    if (
      !/^\/[A-Za-z0-9_-]{1,100}$/.test(name) ||
      !object(value) ||
      !Array.isArray(value.parameters) ||
      !value.parameters.length ||
      value.parameters.length > 24 ||
      !Array.isArray(value.returns) ||
      !value.returns.length
    )
      continue;
    const fields = value.parameters.map(field);
    if (fields.some((v) => !v)) continue;
    const resolved = fields as ProviderField[];
    if (
      new Set(resolved.map((f) => f.name)).size !== resolved.length ||
      resolved.every((f) => f.kind === 'fixed')
    )
      continue;
    const digest = await noahSha256(
      new TextEncoder().encode(JSON.stringify({ name, value })),
    );
    endpoints.push({
      name: name.slice(1),
      label: name.slice(1),
      digest,
      fields: resolved,
    });
  }
  return endpoints;
}
export async function prepareProvider(
  repository: string,
  fetcher: typeof fetch = fetch,
) {
  const signal = AbortSignal.timeout(12000),
    host = await providerOrigin(repository, fetcher, signal);
  const config = await readJson(`${host}/config`, fetcher, signal);
  if (
    !object(config) ||
    typeof config.version !== 'string' ||
    !/^\d+\./.test(config.version) ||
    Number.parseInt(config.version) < 4
  )
    return error('このGradioの実行方式にはまだ対応していません。');
  const prefix =
    Number.parseInt(config.version) >= 5
      ? ('/gradio_api' as const)
      : ('' as const);
  const info = await readJson(`${host}${prefix}/info`, fetcher, signal),
    endpoints = await providerEndpoints(info);
  if (!endpoints.length)
    return error(
      'このAgentの公開APIには、対応できる入力欄がありません。取込設定が必要です。',
    );
  for (const endpoint of endpoints) {
    const dependency = Array.isArray(config.dependencies)
      ? config.dependencies.find(
          (d) => object(d) && d.api_name === endpoint.name,
        )
      : null;
    if (
      object(dependency) &&
      Array.isArray(dependency.inputs) &&
      Array.isArray(config.components)
    ) {
      endpoint.fields.forEach((f, i) => {
        const component = (config.components as unknown[]).find(
          (c) => object(c) && c.id === (dependency.inputs as unknown[])[i],
        );
        if (
          f.kind === 'number' &&
          object(component) &&
          object(component.props)
        ) {
          if (
            typeof component.props.minimum === 'number' &&
            Number.isFinite(component.props.minimum)
          )
            f.minimum = component.props.minimum;
          if (
            typeof component.props.maximum === 'number' &&
            Number.isFinite(component.props.maximum)
          )
            f.maximum = component.props.maximum;
        }
      });
    }
    endpoint.digest = await noahSha256(
      new TextEncoder().encode(
        JSON.stringify([endpoint.digest, endpoint.fields]),
      ),
    );
  }
  return { host, prefix, endpoints };
}
export function providerInput(
  endpoint: ProviderEndpoint,
  input: Record<string, unknown>,
): unknown[] {
  if (
    Object.keys(input).some(
      (k) => !endpoint.fields.some((f) => f.name === k && f.kind !== 'fixed'),
    )
  )
    return error('入力欄にない項目は送信できません。');
  return endpoint.fields.map((f) => {
    if (f.kind === 'fixed') return f.value;
    const v = Object.hasOwn(input, f.name)
      ? input[f.name]
      : f.optional
        ? f.value
        : undefined;
    if (
      f.kind === 'text' &&
      (typeof v !== 'string' || v.length > 8000 || (!f.optional && !v.trim()))
    )
      return error(`${f.label}を入力してください。`);
    if (f.kind === 'number' && (typeof v !== 'number' || !Number.isFinite(v)))
      return error(`${f.label}は数値で入力してください。`);
    if (
      f.kind === 'number' &&
      typeof v === 'number' &&
      ((f.minimum !== undefined && v < f.minimum) ||
        (f.maximum !== undefined && v > f.maximum) ||
        (f.integer && !Number.isInteger(v)))
    )
      return error(`${f.label}は指定範囲の数値で入力してください。`);
    if (f.kind === 'boolean' && typeof v !== 'boolean')
      return error(`${f.label}を選んでください。`);
    if (
      f.kind === 'choice' &&
      !f.choices?.includes(v as string | number | boolean)
    )
      return error(`${f.label}を選び直してください。`);
    return v;
  });
}
export function providerFailure(raw: unknown): string {
  const message =
    typeof raw === 'string'
      ? raw
      : object(raw) && typeof raw.error === 'string'
        ? raw.error
        : '';
  if (
    /GPU.*duration|maximum allowed|GPU quota|ZeroGPU|exceeded.*GPU/i.test(
      message,
    )
  )
    return '提供元のGPU利用上限で実行できませんでした。Noahの再接続では解消しません。';
  return message
    ? `提供元で処理できませんでした。${message.slice(0, 200)}`
    : '提供元が処理エラーを返しました。再接続ではなく、入力や提供元の稼働状態を確認してください。';
}
export type ProviderEvent =
  | { state: 'complete'; data: unknown }
  | { state: 'error'; error: string }
  | { state: 'pending' };
export async function readProviderEvents(
  response: Response,
): Promise<ProviderEvent> {
  if (!response.ok) {
    await response.body?.cancel();
    return { state: 'error', error: providerHttpError(response.status) };
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    await response.body?.cancel();
    return { state: 'error', error: '提供元の結果を読み取れませんでした。' };
  }
  const reader = response.body?.getReader();
  if (!reader) return { state: 'pending' };
  let buffer = '',
    total = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 1_048_576)
        return { state: 'error', error: '成果が保存上限を超えています。' };
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const packet = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const lines = packet.split(/\r?\n/),
          event = lines
            .find((l) => l.startsWith('event:'))
            ?.slice(6)
            .trim();
        if (event !== 'complete' && event !== 'error') continue;
        const data = lines
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          return {
            state: 'error',
            error: '提供元の結果形式を確認できませんでした。',
          };
        }
        return event === 'complete'
          ? { state: 'complete', data: parsed }
          : { state: 'error', error: providerFailure(parsed) };
      }
    }
  } catch (e) {
    if (e instanceof Error && ['AbortError', 'TimeoutError'].includes(e.name))
      return { state: 'pending' };
    throw e;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return { state: 'pending' };
}
/** Copy bounded, same-provider raster bytes into the durable Work. Never persist an expiring file URL as an image. */
export async function providerResult(
  data: unknown,
  origin: string,
  fetcher: typeof fetch,
): Promise<NoahReceivedResult> {
  if (!Array.isArray(data) || data.length === 0)
    error('提供元から成果が届きませんでした。', 502);
  const imageSignal = AbortSignal.timeout(7000);
  const images: NonNullable<NoahReceivedResult['images']> = [],
    texts: string[] = [];
  let attachments = 0,
    budget = 524288;
  async function walk(v: unknown, depth = 0): Promise<void> {
    if (depth > 8) return;
    if (typeof v === 'string') {
      if (v.trim()) texts.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 100)) await walk(x, depth + 1);
      return;
    }
    if (!object(v)) {
      if (typeof v === 'number' || typeof v === 'boolean')
        texts.push(String(v));
      return;
    }
    if (
      (v.meta && object(v.meta) && v.meta._type === 'gradio.FileData') ||
      (typeof v.path === 'string' && typeof v.url === 'string')
    ) {
      attachments++;
      if (typeof v.url !== 'string' || images.length >= 4 || budget < 32)
        return;
      let u: URL;
      try {
        u = new URL(v.url, origin);
      } catch {
        return;
      }
      if (
        u.origin !== origin ||
        u.username ||
        u.password ||
        !(
          u.pathname.startsWith('/gradio_api/file=') ||
          u.pathname.startsWith('/file=')
        )
      )
        return;
      try {
        const r = await fetcher(u.href, {
            redirect: 'manual',
            signal: imageSignal,
          }),
          bytes = await providerBytes(r, Math.min(budget, 262144)),
          mime = noahRasterMime(bytes);
        if (!mime) return;
        budget -= bytes.length;
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        images.push({
          name: `noah-image-${images.length + 1}.${mime === 'image/jpeg' ? 'jpg' : mime.slice(6)}`,
          mimeType: mime,
          data: btoa(binary),
        });
      } catch {
        /* The text below explicitly records that this attachment was not copied. */
      }
      return;
    }
    if (v.type === 'text' && typeof v.text === 'string') {
      texts.push(v.text);
      return;
    }
    if (typeof v.role === 'string' && 'content' in v) {
      if (v.role === 'assistant') await walk(v.content, depth + 1);
      return;
    }
    if ('text' in v) {
      await walk(v.text, depth + 1);
      return;
    }
    texts.push(JSON.stringify(v));
  }
  for (const item of data as unknown[]) await walk(item);
  if (attachments > images.length)
    texts.push(
      `添付${attachments - images.length}件はNoahへ保存できませんでした。`,
    );
  const all = texts.join('\n\n');
  if (!all.trim() && !images.length)
    error('提供元が空の成果を返しました。', 502);
  return {
    text: all.slice(0, 32000),
    truncated: all.length > 32000,
    attachments,
    ...(images.length ? { images } : {}),
  };
}
