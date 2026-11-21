// Read-only smoke check of the public service. Does not sign in, connect, run or migrate anything.
import { pathToFileURL } from 'node:url';
import { noahPublicOrigin } from '../lib/noah-public-origin.ts';

export async function checkNoahDomain(origin, fetcher = fetch) {
  const base = noahPublicOrigin(origin);
  const checks = [
    ['/noah', 'html'], ['/noah/ready', 'html'], ['/noah/activity', 'html'], ['/noah/data', 'html'],
    ['/api/noah/intake?limit=0', 'catalog'],
    ['/api/noah/connect', 'private'], ['/api/noah/ask', 'private'],
  ];
  return Promise.all(checks.map(async ([path, kind]) => {
    try {
      const response = await fetcher(`${base}${path}`, {
        redirect: 'manual', headers: { Accept: kind === 'html' ? 'text/html' : 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      const status = response.status;
      let ok = false, detail = '';
      if (kind === 'html') {
        ok = status === 200 && (response.headers.get('content-type') ?? '').includes('text/html');
        detail = ok ? 'page available' : 'page unavailable';
        await response.body?.cancel();
      } else if (kind === 'private') {
        ok = status === 401;
        detail = ok ? 'sign-in required' : 'unexpected anonymous response';
        await response.body?.cancel();
      } else {
        // limit=0 returns no catalog entries, only bounded counts and availability.
        const body = status === 200 ? await response.json() : null;
        const counts = body?.counts;
        ok = status === 200 && Array.isArray(body?.items) && body.items.length === 0 &&
          Number.isSafeInteger(counts?.ran) && counts.ran >= 0 && Number.isSafeInteger(counts?.new) && counts.new >= 0;
        detail = ok ? `catalog available (${counts.ran + counts.new} listed)` : status === 404 ? 'catalog not published or disabled' : 'catalog unavailable';
        if (status !== 200) await response.body?.cancel();
      }
      return { path, status, ok, detail };
    } catch { return { path, status: null, ok: false, detail: 'request failed' }; }
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = noahPublicOrigin(process.argv[2]);
  const checks = await checkNoahDomain(origin);
  console.log(JSON.stringify({ origin, ok: checks.every(c => c.ok), checks }, null, 2));
  if (checks.some(c => !c.ok)) process.exitCode = 1;
}
