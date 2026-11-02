const SITE_HOST_SUFFIX = '.chatgpt.site';
const SITE_DISPATCH_PREFIX = 'site---';
function validEmail(value: string) {
  return (
    value.length >= 3 &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

/** Match the same identity precedence used by requestUser before applying cloud-only scopes. */
export function requestUsesEsimCloudIdentity(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (
    authorization.startsWith('Bearer rock_esim_') ||
    authorization.startsWith('RockEsimProof')
  )
    return true;
  if (
    authorization.startsWith('Bearer rock_session_') ||
    request.headers.get('oai-authenticated-user-id')?.trim() ||
    request.headers.get('cookie')?.includes('jennifer_access=') ||
    request.headers.get('cookie')?.includes('rockstar_account_access=')
  )
    return false;
  const email =
    request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() ??
    '';
  const trustedEmail =
    new URL(request.url).hostname.endsWith(SITE_HOST_SUFFIX) &&
    (request.headers.get('x-dispatched-app') ?? '').startsWith(
      SITE_DISPATCH_PREFIX,
    ) &&
    validEmail(email);
  return (
    !trustedEmail &&
    Boolean(request.headers.get('cookie')?.includes('rock_esim_access='))
  );
}

