import { coreMcpToolNames } from './catalog';
import { ensureLocalRuntime } from './sky-local-runtime';
import { connectMcpSession, McpClientError, mcpToolNames, requestMcp } from './mcp-client';

export const DEVICE_URL = 'http://127.0.0.1:38479';
export const DEVICE_PROTOCOLS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;
export const REQUIRED_DEVICE_TOOLS = coreMcpToolNames;
export type RunRecorder = (
  tool: string,
  transport: 'browser' | 'local-mcp',
  status: 'completed' | 'failed',
  started: number,
  sample: boolean,
  outcome?: 'passed' | 'needs_review' | 'failed',
  delegationId?: string,
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
    await requestMcp(deviceRequest(token), 'ping');
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
function deviceRequest(token: string) {
  return { baseUrl: DEVICE_URL, token, protocolVersion: deviceProtocol(), accept: 'application/json, text/event-stream' };
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
  await ensureLocalRuntime('connector');
  const session = await connectMcpSession({
    baseUrl: DEVICE_URL,
    accept: 'application/json, text/event-stream',
    protocols: DEVICE_PROTOCOLS,
    clientInfo: { name: 'rock-star-site', version: '0.2.0' },
    minimumTokenLength: 32,
  }).catch((error: unknown) => {
    if (error instanceof McpClientError) {
      if (error.code === 'token') throw new Error('接続を確認できませんでした。');
      if (error.code === 'protocol') throw new Error('対応するMCPバージョンを確認できませんでした。');
      if (error.code === 'initialized') throw new Error('MCPの初期接続が完了しませんでした。');
      if (error.phase === 'connect') throw new Error('PCの接続アプリを起動してください。');
    }
    throw new Error('MCPに接続できませんでした。');
  });
  const availableTools = mcpToolNames(session.tools);
  if (!REQUIRED_DEVICE_TOOLS.every((name) => availableTools.has(name)))
    throw new Error('PC接続アプリを更新してください。必要なMCPツールが不足しています。');
  if (generation !== sessionGeneration)
    throw new Error('接続確認は取り消されました。');
  const id = crypto.randomUUID();
  sessionStorage.setItem(DEVICE_ID, id);
  sessionStorage.setItem(TOKEN, session.token);
  sessionStorage.setItem(DEVICE_PROTOCOL, session.protocolVersion);
  try {
    await reportDevice('connect', id);
    if (!currentSession(session.token, id, generation))
      throw new Error('PC接続が変更されました。接続状態を確認してください。');
  } catch (error) {
    if (currentSession(session.token, id, generation)) {
      sessionStorage.removeItem(TOKEN);
      sessionStorage.removeItem(DEVICE_ID);
      sessionStorage.removeItem(DEVICE_PROTOCOL);
    }
    throw error;
  }
  window.dispatchEvent(new Event('loop-device'));
  return { token: session.token, toolCount: availableTools.size };
}
export async function runDevice(name: string, args: Record<string, unknown>) {
  const token = deviceToken();
  if (!token) throw new Error('「PC接続」からこのPCを接続してください。');
  const id = deviceId();
  const generation = sessionGeneration;
  activeCalls++;
  try {
    const result = await requestMcp<{
      isError?: boolean;
      content?: { text?: string }[];
      structuredContent?: { output: string; status?: string };
    }>({ ...deviceRequest(token), timeoutMs: 60000 }, 'tools/call', { name, arguments: args })
      .catch((error: unknown) => {
        if (error instanceof McpClientError && (error.code === 'network' || error.code === 'http')) {
          if (currentSession(token, id, generation)) disconnectDevice();
          throw new Error('PCとの接続が切れました。接続し直してください。');
        }
        if (error instanceof McpClientError && error.code === 'rpc') throw new Error(error.message);
        throw new Error('MCPの応答が不正です。');
      });
    if (result.isError)
      throw new Error(result.content?.[0]?.text || '入力を確認してください。');
    if (!result.structuredContent)
      throw new Error('MCPの応答が不正です。');
    return result.structuredContent as { output: string; status?: string };
  } finally {
    activeCalls--;
  }
}
