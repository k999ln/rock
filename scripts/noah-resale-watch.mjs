// Owner-local discovery runner. It never dispatches purchase or publish commands.
import { setTimeout as delay } from 'node:timers/promises';
const mode = process.argv[2];
if (!['--once', '--watch'].includes(mode))
  throw Error('Usage: node scripts/noah-resale-watch.mjs --once|--watch');
const base = new URL(process.env.NOAH_RESALE_ORIGIN || 'http://127.0.0.1:3107');
if (
  base.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== '/'
)
  throw Error('Owner-local HTTP origin required');
const stop = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => stop.abort());
async function tick() {
  const response = await fetch(new URL('/api/noah/resale', base), {
    redirect: 'error',
    signal: AbortSignal.any([stop.signal, AbortSignal.timeout(10000)]),
  });
  if (!response.ok) throw Error(`Noah connection: HTTP ${response.status}`);
  const view = await response.json();
  if (view.job.resale.paused) {
    console.log('探索は停止中');
    return;
  }
  if (!view.ready.search || !view.job.resale.searches)
    throw Error('Noahで3担当の探索条件と検索APIを設定してください。');
  const run = await fetch(new URL('/api/noah/resale', base), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.any([stop.signal, AbortSignal.timeout(75000)]),
    headers: {
      'Content-Type': 'application/json',
      Origin: base.origin,
      'x-noah-resale-owner': view.ownerScope,
    },
    body: JSON.stringify({ action: 'scout', revision: view.job.revision }),
  });
  if (!run.ok) throw Error(`探索未完了: HTTP ${run.status}`);
  const result = await run.json();
  console.log(JSON.stringify(result.job.resale.scan));
}
do {
  try {
    await tick();
  } catch (error) {
    if (stop.signal.aborted) break;
    console.error(error.message);
    if (mode === '--once') {
      process.exitCode = 1;
      break;
    }
  }
  if (mode !== '--watch') break;
  try {
    await delay(15 * 60 * 1000, undefined, { signal: stop.signal });
  } catch {
    break;
  }
} while (!stop.signal.aborted);
