import policy from '../data/web-security-policy.json' with { type: 'json' };

// Framework redirects can return before route-header middleware runs.
export function secureWebResponse(response, url) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(policy.universalHeaders)) headers.set(key, value);
  const pathname = new URL(url).pathname;
  const route = pathname.startsWith('/_next/static/') ? '/_next/static/*' : pathname;
  for (const [key, value] of Object.entries(policy.routeHeaders[route] || {})) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
