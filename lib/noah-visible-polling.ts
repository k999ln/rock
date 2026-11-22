type Visibility = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
type PollEnvironment = {
  visibility: Visibility;
  schedule: typeof setTimeout;
  cancel: typeof clearTimeout;
};

/** Display reads only. Never pass connect/run/stop mutations to this scheduler. */
export function startNoahVisiblePolling(
  read: (signal: AbortSignal) => Promise<number | void>,
  intervalMs: number,
  environment: PollEnvironment = { visibility: document, schedule: setTimeout, cancel: clearTimeout },
) {
  const { visibility, schedule, cancel } = environment;
  let disposed = false, running = false;
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => !disposed && visibility.visibilityState === 'visible';
  const clearTimer = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const poll = async () => {
    clearTimer();
    if (!visible() || running) return;
    running = true;
    const current = new AbortController(); controller = current;
    let delay = intervalMs;
    try {
      const next = await read(current.signal);
      if (typeof next === 'number' && Number.isFinite(next) && next >= 1000) delay = next;
    } catch { /* The reader owns error display; still allow recovery on the next read. */ }
    finally {
      running = false;
      if (controller === current) controller = undefined;
      if (visible()) {
        // If visibility returned while an aborted read settled, read fresh once.
        if (current.signal.aborted) void poll();
        else timer = schedule(() => { void poll(); }, delay);
      }
    }
  };
  const changed = () => {
    clearTimer();
    if (!visible()) controller?.abort();
    else void poll();
  };
  visibility.addEventListener('visibilitychange', changed);
  void poll();
  return () => {
    disposed = true; clearTimer(); controller?.abort();
    visibility.removeEventListener('visibilitychange', changed);
  };
}
