import { pathToFileURL } from 'node:url';
export function startDiscoveryDaemon({
  origin,
  fetcher = fetch,
  intervalMs = 60000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onStatus = () => {},
}) {
  const url = new URL(origin);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !Number.isInteger(intervalMs) ||
    intervalMs < 60000
  )
    throw Error('A loopback Noah origin and at least 60 seconds are required');
  const base = url.origin;
  let timer,
    closed = false,
    active = false,
    controller = null;
  async function tick() {
    if (closed || active) return;
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    active = true;
    controller = new AbortController();
    try {
      const signal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(60000),
        ]),
        state = await fetcher(base + '/api/noah/discovery?state=1', {
          signal,
          redirect: 'manual',
        }),
        data = await state.json();
      if (!state.ok || !/^owner-v1:[a-f0-9]{64}$/.test(data.ownerScope ?? ''))
        throw Error('Owner unavailable');
      if (closed) return;
      const response = await fetcher(base + '/api/noah/discovery', {
        method: 'POST',
        signal,
        redirect: 'manual',
        headers: {
          Origin: base,
          'Content-Type': 'application/json',
          'X-Rock-Owner-Scope': data.ownerScope,
        },
        body: '{}',
      });
      const result = await response.json();
      if (!response.ok || result.ownerScope !== data.ownerScope)
        throw Error('Discovery unavailable');
      if (!closed)
        onStatus({
          state: 'checked',
          at: new Date().toISOString(),
          outcomes: result.outcomes,
        });
    } catch {
      if (!closed)
        onStatus({ state: 'unavailable', at: new Date().toISOString() });
    } finally {
      active = false;
      controller = null;
      if (!closed) {
        timer = setTimer(() => {
          void tick();
        }, intervalMs);
        timer?.unref?.();
      }
    }
  }
  void tick();
  return {
    tick,
    close() {
      closed = true;
      if (timer) clearTimer(timer);
      controller?.abort();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const origin = process.argv[2];
  if (!origin)
    throw Error(
      'Usage: node scripts/noah-discovery-daemon.mjs http://127.0.0.1:3107',
    );
  const daemon = startDiscoveryDaemon({
    origin,
    onStatus: (s) => process.stdout.write(JSON.stringify(s) + '\n'),
  });
  // Keep the scheduled host alive even when a tick has no active HTTP request.
  const keepAlive = setInterval(() => {}, 3600000);
  const stop = () => {
    clearInterval(keepAlive);
    daemon.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
