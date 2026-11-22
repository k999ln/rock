// Bounded production reads: issue ephemeral browser access, never register an
// external account, connect an Agent, execute work, or write a saved result.
import { pathToFileURL } from 'node:url';

export async function checkNoahPilot({ origin, privateResult, people = 100, concurrency = 5 }, fetcher = fetch) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin || base.username || base.password) throw Error('Use an explicit HTTPS origin.');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(privateResult)) throw Error('Supply a known private result UUID.');
  if (!Number.isInteger(people) || people < 1 || people > 100 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw Error('Maximum 100 people and 5 concurrent flows.');
  const started = performance.now(), timings = [], failures = [], issued = new Set();
  let next = 0, requests = 0, successful = 0, denied = 0;
  async function request(path, method = 'GET', cookie) {
    const before = performance.now(); requests++;
    try {
      const response = await fetcher(`${origin}${path}`, { method, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
      const setCookie = response.headers.get('set-cookie');
      const data = await response.json();
      return { status: response.status, data, setCookie };
    } catch { return { status: null }; }
    finally { timings.push(performance.now() - before); }
  }
  function check(kind, response, ok) {
    if (ok) successful++;
    else failures.push({ kind, status: response.status });
    return ok;
  }
  async function worker() {
    while (next++ < people) {
      const session = await request('/api/noah/session', 'POST');
      const cookie = session.setCookie?.split(';')[0];
      if (!check('issue', session, session.status === 200 && session.data?.created === true && cookie?.startsWith('__Host-noah_access=') && !issued.has(cookie))) continue;
      issued.add(cookie);
      const connected = await request('/api/noah/session', 'GET', cookie);
      check('resume', connected, connected.status === 200 && connected.data?.connected === true && connected.data?.created === false);
      const list = await request('/api/noah/ask', 'GET', cookie);
      check('empty-results', list, list.status === 200 && Array.isArray(list.data?.asks) && list.data.asks.length === 0);
      const other = await request(`/api/noah/ask/${privateResult}`, 'GET', cookie);
      if (check('other-owner-result', other, other.status === 404)) denied++;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const independentBrowsers = issued.size; issued.clear();
  timings.sort((a, b) => a - b);
  const percentile = p => Math.round(timings[Math.max(0, Math.ceil(timings.length * p) - 1)] ?? 0);
  return { origin, checkedAt: new Date().toISOString(), people, concurrency, requests, successful, independentBrowsers, otherOwnerDenied: denied, ok: failures.length === 0 && requests === people * 4 && independentBrowsers === people, elapsedMs: Math.round(performance.now() - started), latencyMs: { median: percentile(.5), p95: percentile(.95), max: percentile(1) }, failures, scope: 'Browser access and private reads only; no external registration or execution capacity claim.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkNoahPilot({ origin: process.argv[2], privateResult: process.argv[3] });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
