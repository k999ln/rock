// One observation for a five-minute slot. An independent caller retains stdout
// so failures can be imported after the application is reachable again.
const origin = new URL(process.argv[2] ?? '');
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
if (process.argv.length !== 3 || origin.href !== `${origin.origin}/` ||
  (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback))) {
  throw new Error('Pass the HTTPS origin or the origin of a local rehearsal.');
}
const token = process.env.CLOUD_PROBE_TOKEN ?? '';
if (!/^[A-Za-z0-9_-]{32,256}$/u.test(token)) throw new Error('Set CLOUD_PROBE_TOKEN.');

const observedAt = Date.now();
const started = performance.now();
let statusCode = null;
let ok = false;
try {
  const response = await fetch(new URL('/api/internal/cloud-operations', origin), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  statusCode = response.status;
  if (statusCode === 200) {
    const value = await response.json();
    ok = value.cloudAdmissionReady === true && typeof value.acceptsNewWork === 'boolean';
  }
} catch {
  // A timeout, redirect, invalid response or unreachable origin is an observed failure.
}
console.log(JSON.stringify({ observedAt, statusCode, latencyMs: Math.round(performance.now() - started), ok }));
