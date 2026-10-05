type LocalService = 'connector' | 'fashion';
const starting = new Map<LocalService, Promise<boolean>>();

/** Hosted sites keep their explicit PC connection flow. The local bridge
 * starts only bundled services, never a command provided by the browser. */
export function ensureLocalRuntime(service: LocalService): Promise<boolean> {
  if (typeof window === 'undefined' || !window.location ||
    !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname))
    return Promise.resolve(false);
  const existing = starting.get(service);
  if (existing) return existing;
  const promise = (async () => {
    const response = await fetch('/__sky/runtime/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (response.status === 404) return false;
    const result = await response.json().catch(() => null) as {
      service?: string; status?: string; error?: string;
    } | null;
    if (!response.ok || result?.service !== service || result.status !== 'ready')
      throw new Error(result?.error || '端末内の実行機能を起動できませんでした。もう一度お試しください。');
    return true;
  })().finally(() => {
    if (starting.get(service) === promise) starting.delete(service);
  });
  starting.set(service, promise);
  return promise;
}
