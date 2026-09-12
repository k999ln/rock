const SITE_HOST_SUFFIX = '.chatgpt.site';
const SITE_DISPATCH_PREFIX = 'site---';

function sameOrigin(request: Request) {
  if (request.method === 'GET') return;
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new Error('ORIGIN');
}

function validEmail(value: string) {
  return (
    value.length >= 3 &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

async function pseudonymousEmailId(email: string) {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `sites-email-sha256:${hex}`;
}

export async function requestUser(request: Request): Promise<string> {
  sameOrigin(request);

  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  if (id) {
    if (id.length > 256) throw new Error('UNAUTHORIZED');
    return id;
  }

  const url = new URL(request.url);
  const dispatch = request.headers.get('x-dispatched-app') ?? '';
  const email =
    request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() ??
    '';
  if (
    !url.hostname.endsWith(SITE_HOST_SUFFIX) ||
    !dispatch.startsWith(SITE_DISPATCH_PREFIX) ||
    !validEmail(email)
  )
    throw new Error('UNAUTHORIZED');

  return pseudonymousEmailId(email);
}
