export const DEVICE_URL = 'http://127.0.0.1:38479';
export const DEVICE_PROTOCOLS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;
export const REQUIRED_DEVICE_TOOLS = [
  'coconala_check',
  'format_citations',
  'make_free_article',
  'verify_delivery',
] as const;
export type RunRecorder = (
  tool: string,
  transport: 'browser' | 'local-mcp',
  status: 'completed' | 'failed',
  started: number,
  sample: boolean,
  outcome?: 'passed' | 'needs_review' | 'failed',
) => Promise<void>;
const TOKEN = 'loop.device.session';
const DEVICE_ID = 'loop.device.id';
const DEVICE_PROTOCOL = 'loop.device.protocol';
let verifying: {
  token: string;
  id: string;
  generation: number;
  promise: Promise<void>;
} | null = null;
let activeCalls = 0;
let sessionGeneration = 0;
export function deviceId() {
  let id = sessionStorage.getItem(DEVICE_ID);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(DEVICE_ID, id);
  }
  return id;
}
function currentSession(token: string, id: string, generation: number) {
  return (
    sessionGeneration === generation &&
    deviceToken() === token &&
    sessionStorage.getItem(DEVICE_ID) === id
  );
}
export function captureDeviceSession() {
  const token = deviceToken();
  if (!token) throw new Error('PCを接続してください。');
  const id = deviceId(),
    generation = sessionGeneration;
  return { id, isCurrent: () => currentSession(token, id, generation) };
}
async function reportDevice(
  action: 'connect' | 'heartbeat' | 'disconnect',
  id = deviceId(),
) {
  const response = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      action,
      ...(action === 'connect' ? { name: 'このPC' } : {}),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error('PC接続の保存を確認できません。再接続してください。');
}
export function verifyDevice(): Promise<void> {
  const token = deviceToken();
  if (!token) return Promise.reject(new Error('PCを接続してください。'));
  const id = deviceId();
  const generation = sessionGeneration;
  if (
    verifying?.token === token &&
    verifying.id === id &&
    verifying.generation === generation
  )
    return verifying.promise;
  const promise = (async () => {
    const response = await fetch(DEVICE_URL + '/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'MCP-Protocol-Version': deviceProtocol(),
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'ping',
      }),
      signal: AbortSignal.timeout(5000),
    });
    const message = (await response.json()) as {
      error?: unknown;
      result?: unknown;
    };
    if (!response.ok || message.error || !message.result)
      throw new Error('PCとの接続が切れました。');
    if (!currentSession(token, id, generation))
      throw new Error('PC接続が変更されました。もう一度実行してください。');
    await reportDevice('heartbeat', id);
    if (!currentSession(token, id, generation))
      throw new Error('PC接続が変更されました。もう一度実行してください。');
  })()
    .catch((error) => {
      // An old ping must never disconnect or admit work on a newly connected PC.
      if (currentSession(token, id, generation)) disconnectDevice();
      throw error;
    })
    .finally(() => {
      if (verifying?.promise === promise) verifying = null;
    });
  verifying = { token, id, generation, promise };
  return promise;
}
export function monitorDevice() {
  const check = () => {
    if (deviceToken() && !activeCalls) void verifyDevice().catch(() => {});
  };
  check();
  const timer = setInterval(check, 30000);
  window.addEventListener('online', check);
  return () => {
    clearInterval(timer);
    window.removeEventListener('online', check);
  };
}
export function deviceToken() {
  try {
    return sessionStorage.getItem(TOKEN) || '';
  } catch {
    return '';
  }
}
export function deviceProtocol() {
  try {
    const value = sessionStorage.getItem(DEVICE_PROTOCOL);
    return DEVICE_PROTOCOLS.includes(value as (typeof DEVICE_PROTOCOLS)[number])
      ? (value as (typeof DEVICE_PROTOCOLS)[number])
      : DEVICE_PROTOCOLS[0];
  } catch {
    return DEVICE_PROTOCOLS[0];
  }
}
export function disconnectDevice() {
  sessionGeneration++;
  if (deviceToken()) void reportDevice('disconnect').catch(() => {});
  try {
    sessionStorage.removeItem(TOKEN);
    sessionStorage.removeItem(DEVICE_ID);
    sessionStorage.removeItem(DEVICE_PROTOCOL);
  } catch {}
  window.dispatchEvent(new Event('loop-device'));
}
export async function connectDevice() {
  const generation = ++sessionGeneration;
  const r = await fetch(DEVICE_URL + '/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error('PCの接続アプリを起動してください。');
  const data = (await r.json()) as { token: string };
  if (typeof data.token !== 'string' || data.token.length < 32)
    throw new Error('接続を確認できませんでした。');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: 'Bearer ' + data.token,
  };
  const call = async (id: number, method: string, params: unknown = {}) => {
    const response = await fetch(DEVICE_URL + '/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as {
      error?: unknown;
      result: {
        tools?: { name?: unknown }[];
        protocolVersion?: string;
      };
    };
    if (!response.ok || result.error)
      throw new Error('MCPに接続できませんでした。');
    return result.result;
  };
  const initialized = await call(1, 'initialize', {
    protocolVersion: DEVICE_PROTOCOLS[0],
    capabilities: {},
    clientInfo: { name: 'rock-star-site', version: '0.2.0' },
  });
  if (
    !initialized.protocolVersion ||
    !DEVICE_PROTOCOLS.includes(
      initialized.protocolVersion as (typeof DEVICE_PROTOCOLS)[number],
    )
  )
    throw new Error('対応するMCPバージョンを確認できませんでした。');
  headers['MCP-Protocol-Version'] = initialized.protocolVersion;
  const notification = await fetch(DEVICE_URL + '/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!notification.ok) throw new Error('MCPの初期接続が完了しませんでした。');
  const listed = await call(2, 'tools/list');
  const available = new Set(
    listed.tools
      ?.map((tool) => tool.name)
      .filter((name): name is string => typeof name === 'string') ?? [],
  );
  const missing = REQUIRED_DEVICE_TOOLS.filter((name) => !available.has(name));
  if (missing.length)
    throw new Error(
      `PC接続アプリを更新してください。不足: ${missing.join(', ')}`,
    );
  if (generation !== sessionGeneration)
    throw new Error('接続確認は取り消されました。');
  const id = crypto.randomUUID();
  sessionStorage.setItem(DEVICE_ID, id);
  sessionStorage.setItem(TOKEN, data.token);
  sessionStorage.setItem(DEVICE_PROTOCOL, initialized.protocolVersion);
  try {
    await reportDevice('connect', id);
    if (!currentSession(data.token, id, generation))
      throw new Error('PC接続が変更されました。接続状態を確認してください。');
  } catch (error) {
    if (currentSession(data.token, id, generation)) {
      sessionStorage.removeItem(TOKEN);
      sessionStorage.removeItem(DEVICE_ID);
      sessionStorage.removeItem(DEVICE_PROTOCOL);
    }
    throw error;
  }
  window.dispatchEvent(new Event('loop-device'));
  return { ...data, toolCount: available.size };
}
export async function runDevice(name: string, args: Record<string, unknown>) {
  const token = deviceToken();
  if (!token) throw new Error('「PC接続」からこのPCを接続してください。');
  const id = deviceId();
  const generation = sessionGeneration;
  activeCalls++;
  try {
    const r = await fetch(DEVICE_URL + '/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': deviceProtocol(),
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(60000),
    }).catch(() => {
      if (currentSession(token, id, generation)) disconnectDevice();
      throw new Error('PCとの接続が切れました。接続し直してください。');
    });
    if (!r.ok) {
      if (currentSession(token, id, generation)) disconnectDevice();
      throw new Error('PCとの接続が切れました。接続し直してください。');
    }
    const data = (await r.json()) as {
      error?: { message: string };
      result?: {
        isError?: boolean;
        content: { text?: string }[];
        structuredContent: { output: string; status?: string };
      };
    };
    if (data.error || data.result?.isError)
      throw new Error(
        data.error?.message ||
          data.result?.content[0]?.text ||
          '入力を確認してください。',
      );
    if (!data.result?.structuredContent)
      throw new Error('MCPの応答が不正です。');
    return data.result.structuredContent as { output: string; status?: string };
  } finally {
    activeCalls--;
  }
}
