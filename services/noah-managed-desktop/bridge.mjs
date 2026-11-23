// Private service binding from CloudWork. Runtime configuration fixes both the
// destination and package version. Public HTTP routes are disabled.
const desktopBridge = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!/^\/jobs\/[0-9a-f]{64}$/.test(path)) return new Response(null, { status: 404 });
    if (!['GET', 'PUT', 'DELETE'].includes(request.method)) return new Response(null, { status: 405 });
    if (!/^[0-9a-f]{64}$/.test(env.NOAH_DESKTOP_PACKAGE_SHA256 ?? '') ||
        typeof env.DESKTOP_RUNNER_TOKEN !== 'string' || env.DESKTOP_RUNNER_TOKEN.length < 32)
      return new Response(null, { status: 503 });
    if (request.headers.get('X-Noah-Desktop-Package') !== env.NOAH_DESKTOP_PACKAGE_SHA256)
      return new Response(null, { status: 409 });
    try {
      const origin = new URL(env.DESKTOP_RUNNER_ORIGIN);
      if (origin.protocol !== 'https:' || origin.origin !== env.DESKTOP_RUNNER_ORIGIN)
        return new Response(null, { status: 503 });
      const upstream = await fetch(new URL(path, origin), {
        method: request.method, redirect: 'manual', signal: AbortSignal.timeout(7000),
        headers: { Authorization: 'Bearer ' + env.DESKTOP_RUNNER_TOKEN,
          'X-Noah-Desktop-Package': env.NOAH_DESKTOP_PACKAGE_SHA256, 'Content-Type': 'application/json' },
        body: request.method === 'PUT' ? request.body : null,
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel();
        return new Response(null, { status: 502 });
      }
      return upstream;
    } catch { return new Response(null, { status: 503 }); }
  },
};
export default desktopBridge;
