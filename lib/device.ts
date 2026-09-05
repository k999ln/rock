export const DEVICE_URL = 'http://127.0.0.1:38479';
export type RunRecorder = (
  tool: string, transport: 'browser' | 'local-mcp', status: 'completed' | 'failed',
  started: number, sample: boolean, outcome?: 'passed' | 'needs_review' | 'failed',
) => Promise<void>;
const TOKEN = 'loop.device.session';
export function deviceToken() {
  try {
    return sessionStorage.getItem(TOKEN) || '';
  } catch {
    return '';
  }
}
export function disconnectDevice() {
  try {
    sessionStorage.removeItem(TOKEN);
  } catch {}
  window.dispatchEvent(new Event('loop-device'));
}
export async function connectDevice() {
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
      result: { tools?: unknown[]; protocolVersion?: string };
    };
    if (!response.ok || result.error)
      throw new Error('MCPに接続できませんでした。');
    return result.result;
  };
  const initialized = await call(1, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'rock-star-site', version: '0.2.0' },
  });
  if (initialized.protocolVersion !== '2025-11-25')
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
  if (notification.status !== 202)
    throw new Error('MCPの初期接続が完了しませんでした。');
  const listed = await call(2, 'tools/list');
  if (listed.tools?.length !== 4)
    throw new Error('MCPツールを確認できませんでした。');
  sessionStorage.setItem(TOKEN, data.token);
  window.dispatchEvent(new Event('loop-device'));
  return data;
}
export async function runDevice(name: string, args: Record<string, unknown>) {
  const token = deviceToken();
  if (!token) throw new Error('「PC・MCP接続」からこのPCを接続してください。');
  const r = await fetch(DEVICE_URL + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(60000),
  }).catch(()=>{disconnectDevice();throw new Error('PCとの接続が切れました。接続し直してください。');});
  if (!r.ok) {disconnectDevice();throw new Error('PCとの接続が切れました。接続し直してください。');}
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
  if (!data.result?.structuredContent) throw new Error('MCPの応答が不正です。');
  return data.result.structuredContent as { output: string; status?: string };
}
export async function recordRun(
  tool: string,
  transport: 'browser' | 'local-mcp',
  status: 'completed' | 'failed',
  started: number,
  sample = false,
) {
  const r = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      tool,
      transport,
      status,
      sample,
      durationMs: Math.min(300000, Math.round(performance.now() - started)),
    }),
  });
  if (!r.ok)
    throw new Error('結果はできましたが、実行履歴の保存に失敗しました。');
  window.dispatchEvent(new Event('loop-fund-refresh'));
}
