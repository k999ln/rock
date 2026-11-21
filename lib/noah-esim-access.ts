/** Explicit Noah service permission; it never grants account, payment or listing administration. */
export function noahEsimRequestScope(request: Request): 'noah' | null {
  const path = new URL(request.url).pathname, method = request.method;
  if (['GET', 'POST'].includes(method) && path === '/api/noah/session') return 'noah';
  if (['GET', 'POST'].includes(method) && [
    '/api/noah/connect', '/api/noah/ask', '/api/noah/profile',
    '/api/noah/registration', '/api/noah/registration/browser',
    '/api/noah/data', '/api/noah/feedback',
  ].includes(path)) return 'noah';
  if (['GET', 'POST'].includes(method) && /^\/api\/noah\/(connect|ask)\/[A-Za-z0-9._:-]{1,160}$/.test(path)) return 'noah';
  if (method === 'GET' && /^\/api\/noah\/connect\/[A-Za-z0-9._:-]{1,160}\/tools$/.test(path)) return 'noah';
  if (method === 'POST' && path === '/api/noah/profile/documents') return 'noah';
  if (method === 'GET' && /^\/api\/noah\/profile\/documents\/[A-Za-z0-9._:-]{1,160}$/.test(path)) return 'noah';
  if (method === 'GET' && ['/api/noah/connect-plan', '/api/noah/usage'].includes(path)) return 'noah';
  return null;
}

/** Observe the existing verified owner. Never create a Noah account or accept a SIM number as identity. */
export function createNoahSessionApi(deps: {
  authenticate: (request: Request) => Promise<string>;
  esimConfigured: boolean;
}) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' };
    if (request.method !== 'GET') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
    try {
      await deps.authenticate(request);
      return Response.json({ connected: true }, { headers });
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED')
        return Response.json({ connected: false, esimConfigured: deps.esimConfigured }, { status: 401, headers });
      return Response.json({ error: 'CONNECTION_UNAVAILABLE' }, { status: 503, headers });
    }
  };
}
