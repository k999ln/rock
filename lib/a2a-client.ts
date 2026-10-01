/** Minimal A2A 1.0 JSON-RPC client boundary for approved agent delegation.
 *
 * This module deliberately does not retry `message/send`: A2A permits (but
 * does not require) servers to deduplicate messageId, so a lost response is
 * indeterminate until the caller reconciles it with durable local state.
 */

export const A2A_PROTOCOL_VERSION = '1.0';
const MAX_CARD_BYTES = 256_000;
const MAX_RESPONSE_BYTES = 1_000_000;

export type A2AAgentCard = {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: Array<{
    url: string;
    protocolBinding: string;
    protocolVersion: string;
  }>;
  capabilities?: { streaming?: boolean; pushNotifications?: boolean };
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    tags?: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
  }>;
  [key: string]: unknown;
};

export type A2ATaskState =
  | 'TASK_STATE_UNSPECIFIED'
  | 'TASK_STATE_SUBMITTED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_REJECTED'
  | 'TASK_STATE_AUTH_REQUIRED';

export type A2ATask = {
  id: string;
  contextId?: string;
  status: { state: A2ATaskState; message?: unknown; timestamp?: string };
  artifacts?: unknown[];
  [key: string]: unknown;
};

export type A2AOutcome =
  | { kind: 'task'; task: A2ATask }
  | { kind: 'message'; message: unknown };

export class A2AClientError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(message: string, code: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'A2AClientError';
  }
}

export class A2ARequestIndeterminateError extends A2AClientError {
  readonly messageId: string;
  constructor(messageId: string) {
    super(
      'A2A送信の応答を確認できません。messageIdを保持し、再送せず相手側の状態を照合してください。',
      'a2a_request_indeterminate',
    );
    this.messageId = messageId;
    this.name = 'A2ARequestIndeterminateError';
  }
}

export type A2AClientOptions = {
  /** Exact origins approved by the account owner for this connection. */
  allowedOrigins: string[];
  /** Credentials are provided per connection and are never persisted here. */
  bearerToken?: string;
  /** Must verify the persisted, owner-approved Broker snapshot before dispatch. */
  authorizeDelegation?: (intent: {
    messageId: string;
    targetOrigin: string;
    targetAgentName: string;
    agentVersion: string;
    inputSha256: string;
    protocolVersion: typeof A2A_PROTOCOL_VERSION;
  }) => Promise<void>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeUrl(value: unknown, allowedOrigins: string[]): URL {
  if (typeof value !== 'string' || value.length > 2048)
    throw new A2AClientError('A2AのURLが不正です。', 'invalid_a2a_url');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new A2AClientError('A2AのURLが不正です。', 'invalid_a2a_url');
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new A2AClientError('A2A接続はHTTPSが必要です。', 'insecure_a2a_url');
  if (!allowedOrigins.includes(url.origin))
    throw new A2AClientError(
      'A2A接続先のoriginが本人の許可リストにありません。',
      'a2a_origin_not_approved',
    );
  if (url.username || url.password || url.hash)
    throw new A2AClientError('A2A URLに認証情報やfragmentは使えません。', 'invalid_a2a_url');
  return url;
}

async function readJson(response: Response, maximum: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum)
    throw new A2AClientError('A2A応答が上限を超えています。', 'a2a_response_too_large');
  const reader = response.body?.getReader();
  if (!reader) throw new A2AClientError('A2A応答が空です。', 'invalid_a2a_json');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new A2AClientError('A2A応答が上限を超えています。', 'a2a_response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new A2AClientError('A2A応答をJSONとして読めません。', 'invalid_a2a_json');
  }
}

export function parseA2AAgentCard(value: unknown): A2AAgentCard {
  if (
    !object(value) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.description !== 'string' ||
    typeof value.version !== 'string' ||
    !Array.isArray(value.supportedInterfaces)
  )
    throw new A2AClientError('A2A Agent Cardの必須項目が不足しています。', 'invalid_agent_card');
  const interfaces = value.supportedInterfaces.filter(
    (entry): entry is Record<string, unknown> => object(entry),
  );
  const jsonRpc = interfaces.find(
    (entry) => entry.protocolBinding === 'JSONRPC' && entry.protocolVersion === A2A_PROTOCOL_VERSION,
  );
  if (!jsonRpc || typeof jsonRpc.url !== 'string')
    throw new A2AClientError('A2A 1.0 JSON-RPC接続先がありません。', 'unsupported_a2a_interface');
  if (
    value.skills !== undefined &&
    (!Array.isArray(value.skills) ||
      value.skills.some(
        (skill) =>
          !object(skill) ||
          typeof skill.id !== 'string' ||
          typeof skill.name !== 'string' ||
          typeof skill.description !== 'string',
      ))
  )
    throw new A2AClientError('A2A Agent Cardのskillsが不正です。', 'invalid_agent_card');
  const capabilities = value.capabilities;
  if (object(capabilities) && Array.isArray(capabilities.extensions)) {
    if (capabilities.extensions.some((extension) => !object(extension) || typeof extension.uri !== 'string'))
      throw new A2AClientError('A2A Agent Cardのextensionsが不正です。', 'invalid_agent_card');
    if (capabilities.extensions.some((extension) => extension.required === true))
      throw new A2AClientError(
        '未対応の必須A2A extensionが宣言されているため接続しません。',
        'unsupported_a2a_extension',
      );
  }
  return value as A2AAgentCard;
}

export function createA2AClient(options: A2AClientOptions) {
  if (options.allowedOrigins.length === 0)
    throw new A2AClientError('A2A接続先の許可originが必要です。', 'a2a_origin_not_approved');
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const headers = () => {
    const result = new Headers({ Accept: 'application/json' });
    if (options.bearerToken) result.set('Authorization', `Bearer ${options.bearerToken}`);
    return result;
  };
  async function request(url: URL, init?: RequestInit) {
    const signal = init?.signal ?? AbortSignal.timeout(timeoutMs);
    try {
      return await fetcher(url, {
        ...init,
        headers: new Headers(init?.headers ?? headers()),
        // Worker's Fetch API supports only "follow" and "manual". Manual
        // keeps the approved origin boundary intact; callers reject every
        // non-2xx response rather than following a redirect.
        redirect: 'manual',
        signal,
      });
    } catch {
      throw new A2AClientError('A2A接続に失敗しました。', 'a2a_transport_error');
    }
  }
  async function rpc<T>(endpoint: URL, method: string, params: Record<string, unknown>, id: string) {
    const response = await request(endpoint, {
      method: 'POST',
      headers: new Headers({
        ...Object.fromEntries(headers()),
        'Content-Type': 'application/json',
        'A2A-Version': A2A_PROTOCOL_VERSION,
      }),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const payload = await readJson(response, MAX_RESPONSE_BYTES);
    if (!response.ok)
      throw new A2AClientError('A2A相手が要求を受け付けませんでした。', 'a2a_http_error', response.status);
    if (!object(payload) || payload.jsonrpc !== '2.0' || payload.id !== id)
      throw new A2AClientError('A2A JSON-RPC応答のIDまたは形式が一致しません。', 'invalid_a2a_rpc_response');
    if (object(payload.error))
      throw new A2AClientError('A2A相手で要求が失敗しました。', 'a2a_remote_error');
    if (!('result' in payload))
      throw new A2AClientError('A2A応答にresultがありません。', 'invalid_a2a_rpc_response');
    return payload.result as T;
  }

  return {
    async discover(cardUrl: string) {
      const url = safeUrl(cardUrl, options.allowedOrigins);
      const response = await request(url, { method: 'GET' });
      if (!response.ok)
        throw new A2AClientError('A2A Agent Cardを取得できません。', 'agent_card_fetch_failed', response.status);
      return parseA2AAgentCard(await readJson(response, MAX_CARD_BYTES));
    },
    async discoverAtOrigin(origin: string) {
      const url = safeUrl(new URL('/.well-known/agent-card.json', origin).toString(), options.allowedOrigins);
      const response = await request(url, { method: 'GET' });
      if (!response.ok)
        throw new A2AClientError('A2A Agent Cardを取得できません。', 'agent_card_fetch_failed', response.status);
      return parseA2AAgentCard(await readJson(response, MAX_CARD_BYTES));
    },
    async sendMessage(card: A2AAgentCard, messageId: string, text: string): Promise<A2AOutcome> {
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(messageId) || !text.trim() || text.length > 32_000)
        throw new A2AClientError('A2A委任メッセージが不正です。', 'invalid_a2a_message');
      if (!options.authorizeDelegation)
        throw new A2AClientError('Broker承認を確認できないため、委任を送信しません。', 'delegation_authorization_required');
      const parsed = parseA2AAgentCard(card);
      const iface = parsed.supportedInterfaces.find(
        (item) => item.protocolBinding === 'JSONRPC' && item.protocolVersion === A2A_PROTOCOL_VERSION,
      )!;
      const endpoint = safeUrl(iface.url, options.allowedOrigins);
      const inputSha256 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const digest = [...new Uint8Array(inputSha256)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      await options.authorizeDelegation({
        messageId,
        targetOrigin: endpoint.origin,
        targetAgentName: parsed.name,
        agentVersion: parsed.version,
        inputSha256: digest,
        protocolVersion: A2A_PROTOCOL_VERSION,
      });
      let result: unknown;
      try {
        result = await rpc<unknown>(
          endpoint,
          'message/send',
          {
            message: { role: 'ROLE_USER', messageId, parts: [{ text }] },
            configuration: { returnImmediately: true },
          },
          messageId,
        );
      } catch (error) {
        if (
          error instanceof A2AClientError &&
          (['a2a_transport_error', 'invalid_a2a_json', 'invalid_a2a_rpc_response', 'a2a_response_too_large'].includes(error.code) ||
            (error.code === 'a2a_http_error' && (error.status ?? 0) >= 500))
        )
          throw new A2ARequestIndeterminateError(messageId);
        throw error;
      }
      if (!object(result))
        throw new A2ARequestIndeterminateError(messageId);
      if (object(result.task)) {
        try {
          return { kind: 'task', task: parseTask(result.task) };
        } catch {
          throw new A2ARequestIndeterminateError(messageId);
        }
      }
      if (object(result.message)) return { kind: 'message', message: result.message };
      throw new A2ARequestIndeterminateError(messageId);
    },
    async getTask(card: A2AAgentCard, taskId: string): Promise<A2ATask> {
      return parseTask(await rpc<unknown>(endpointFor(card, options.allowedOrigins), 'tasks/get', { id: taskId, historyLength: 0 }, crypto.randomUUID()));
    },
    async cancelTask(card: A2AAgentCard, taskId: string): Promise<A2ATask> {
      return parseTask(await rpc<unknown>(endpointFor(card, options.allowedOrigins), 'tasks/cancel', { id: taskId }, crypto.randomUUID()));
    },
  };
}

function endpointFor(card: A2AAgentCard, allowedOrigins: string[]) {
  const parsed = parseA2AAgentCard(card);
  const iface = parsed.supportedInterfaces.find(
    (item) => item.protocolBinding === 'JSONRPC' && item.protocolVersion === A2A_PROTOCOL_VERSION,
  )!;
  return safeUrl(iface.url, allowedOrigins);
}

function parseTask(value: unknown): A2ATask {
  const states: A2ATaskState[] = [
    'TASK_STATE_UNSPECIFIED', 'TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING',
    'TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED',
    'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_REJECTED', 'TASK_STATE_AUTH_REQUIRED',
  ];
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !object(value.status) ||
    !states.includes(value.status.state as A2ATaskState)
  )
    throw new A2AClientError('A2A taskの状態を検証できません。', 'invalid_a2a_task');
  return value as A2ATask;
}
