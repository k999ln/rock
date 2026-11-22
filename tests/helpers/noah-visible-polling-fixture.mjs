import { startNoahVisiblePolling } from '../../lib/noah-visible-polling.ts';

export function visiblePollingFixture(initial = 'visible') {
  const timers = new Map(), listeners = new Set(); let timerId = 0;
  const visibility = {
    visibilityState: initial,
    addEventListener(type, fn) { if (type === 'visibilitychange') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'visibilitychange') listeners.delete(fn); },
  };
  const environment = {
    visibility,
    schedule(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    cancel(id) { timers.delete(id); },
  };
  return {
    timers, listeners,
    start: (read, interval) => startNoahVisiblePolling(read, interval, environment),
    change(state) { visibility.visibilityState = state; for (const fn of listeners) fn(); },
    async next() { const [id, { fn }] = timers.entries().next().value; timers.delete(id); await fn(); },
  };
}
