/** A paired Mac can receive Noah jobs and their pinned source, never account or payment access. */
export function noahRunnerRequestAllowed(request: Request): boolean {
  if (request.headers.has('origin')) return false;
  const path = new URL(request.url).pathname;
  if (request.method === 'POST') return path === '/api/noah/runner';
  if (request.method !== 'GET') return false;
  if (['/api/noah/launch', '/api/noah/releases'].includes(path)) return true;
  const id = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  return new RegExp(`^/api/noah/agents/${id}(?:/source)?$`, 'i').test(path)
    || /^\/api\/noah\/releases\/[A-Za-z0-9._~%:-]{1,500}\/source$/.test(path);
}
