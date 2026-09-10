import type { Job, JobTool } from './operations';
import { captureDeviceSession, verifyDevice } from './device';
export class OperationRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function operationRequest<T>(
  path: string,
  method = 'GET',
  value?: unknown,
): Promise<T> {
  const options: RequestInit = {
    method,
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  };
  if (value !== undefined && method !== 'GET') {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(value);
  }
  const response = await fetch(path, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new OperationRequestError(
      data.error || '保存できませんでした。',
      response.status,
    );
  return data as T;
}
export const processedBytes = (value: unknown) =>
  new TextEncoder().encode(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).byteLength;
let inFlight = false;
export async function executeTracked<T extends { output: string }>(options: {
  tool: JobTool;
  transport: 'browser' | 'local-mcp';
  sample: boolean;
  inputBytes: number;
  task: () => T | Promise<T>;
}): Promise<{ result: T; warning: string }> {
  if (inFlight) throw new Error('実行中の処理が終わってからお試しください。');
  inFlight = true;
  let started = 0;
  let job: Job | null = null;
  window.dispatchEvent(
    new CustomEvent('loop-run-state', { detail: options.tool }),
  );
  const finish = async (
    status: 'completed' | 'failed',
    outputBytes: number,
  ) => {
    const payload = {
      action: 'finish',
      status,
      durationMs: Math.min(
        120000,
        Math.max(0, Math.round(performance.now() - started)),
      ),
      outputBytes,
    };
    // Only a result report is retried. The task and start claim are never automatically repeated.
    try {
      await operationRequest(`/api/jobs/${job!.id}`, 'PATCH', payload);
    } catch {
      await operationRequest(`/api/jobs/${job!.id}`, 'PATCH', payload);
    }
  };
  try {
    const session =
      options.transport === 'local-mcp' ? captureDeviceSession() : null;
    if (session) {
      await verifyDevice();
      if (!session.isCurrent())
        throw new Error('PC接続が変更されました。もう一度実行してください。');
    }
    job = await operationRequest<Job>('/api/jobs', 'POST', {
      id: crypto.randomUUID(),
      tool: options.tool,
      transport: options.transport,
      sample: options.sample,
      inputBytes: options.inputBytes,
      deviceId: session?.id ?? null,
    });
    // An ambiguous start response must not be turned into a second execution.
    await operationRequest(`/api/jobs/${job.id}`, 'PATCH', { action: 'start' });
    started = performance.now();
    window.dispatchEvent(new Event('loop-fund-refresh'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    let result: T;
    try {
      if (session && !session.isCurrent())
        throw new Error(
          '実行前にPC接続が変更されたため、処理を停止しました。もう一度実行してください。',
        );
      result = await options.task();
    } catch (error) {
      await finish('failed', 0).catch(() => {});
      throw error;
    }
    let warning = '';
    try {
      await finish('completed', processedBytes(result.output));
    } catch {
      warning =
        '結果はできましたが、完了の保存を確認できません。結果を保存し、履歴を確認してください。';
    }
    return { result, warning };
  } finally {
    inFlight = false;
    window.dispatchEvent(new CustomEvent('loop-run-state', { detail: '' }));
    window.dispatchEvent(new Event('loop-fund-refresh'));
  }
}
