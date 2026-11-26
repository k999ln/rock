/** Navigation only. No authentication or execution grants. */
import { noahShortPageDestination } from '../services/sky-web/noah-page-routes.mjs';

export function noahReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 2000 || !value.startsWith('/') || /[\\\r\n]/.test(value)) return '/noah';
  try {
    const url = new URL(value, 'https://avoado.si');
    if (url.origin !== 'https://avoado.si' ||
        (!/^\/noah(?:\/|$)/.test(url.pathname) && !noahShortPageDestination(url.pathname)) ||
        /^\/noah\/account(?:\/|$)/.test(url.pathname)) return '/noah';
    return url.pathname + url.search + url.hash;
  } catch { return '/noah'; }
}

export function noahSignInHref(returnTo = '/noah'): string {
  return `/signin-with-chatgpt?${new URLSearchParams({ return_to: noahReturnPath(returnTo) })}`;
}

export function noahAccountHref(returnTo = '/noah'): string {
  return `/noah/account?${new URLSearchParams({ returnTo: noahReturnPath(returnTo) })}`;
}
