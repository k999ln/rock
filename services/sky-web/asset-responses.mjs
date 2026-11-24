import { secureResponse } from './domain-router.mjs';

// Sites may serve a matching static file before invoking the Worker, ignoring
// Wrangler's run_worker_first. Build-time relocation leaves canonical URLs to
// this handler. The backing files contain public bytes, never owner data.
const STORAGE_ORIGIN = 'https://sky-marketplace.noellesugar1.chatgpt.site';
const FORWARDED_HEADERS = ['range', 'if-range', 'if-none-match', 'if-modified-since'];
const MAX_THEATER_RANGE_FALLBACK_BYTES = 4 * 1024 * 1024;

// Some asset bindings ignore Range. The short, public MP4 trailers must still
// answer a browser's single-range GET so that the native player can seek.
async function theaterRangeResponse(request, response, size) {
  if (request.method !== 'GET' || response.status !== 200 || !response.body) return response;
  const { headers } = response;
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_THEATER_RANGE_FALLBACK_BYTES ||
      (headers.has('content-length') && Number(headers.get('content-length')) !== size) ||
      headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'video/mp4' ||
      (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity')) return response;

  const range = /^bytes=(\d*)-(\d*)$/i.exec(request.headers.get('range') ?? '');
  if (!range || (!range[1] && !range[2])) return response;
  const validator = request.headers.get('if-range');
  if (validator && !(
    (validator.startsWith('"') && validator === headers.get('etag')) ||
    validator === headers.get('last-modified')
  )) return response;

  const first = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const last = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
  const partial = new Headers(headers);
  partial.set('accept-ranges', 'bytes');
  if (first > last) {
    await response.body.cancel();
    partial.set('content-range', 'bytes */' + size);
    partial.set('content-length', '0');
    return new Response(null, { status: 416, headers: partial });
  }
  partial.set('content-range', 'bytes ' + first + '-' + last + '/' + size);
  partial.set('content-length', String(last - first + 1));
  const body = first === 0 && last === size - 1 ? response.body :
    new Uint8Array(await response.arrayBuffer()).subarray(first, last + 1);
  return new Response(body, { status: 206, headers: partial });
}

export function withAssetResponses(worker, entries, upstreamFetch = fetch) {
  return {
    ...worker,
    async fetch(request, env, context) {
      const url = new URL(request.url);
      const entry = Object.hasOwn(entries, url.pathname) ? entries[url.pathname] : null;
      if (!entry || !['GET', 'HEAD'].includes(request.method)) return worker.fetch(request, env, context);
      let response;
      if (entry.body !== undefined) {
        const notModified = url.pathname !== '/sw.js' && request.headers.get('if-none-match') === entry.etag;
        response = new Response(notModified || request.method === 'HEAD' ? null : Uint8Array.from(atob(entry.body), c => c.charCodeAt(0)), {
          status: notModified ? 304 : 200,
          headers: { 'content-type': entry.type, etag: entry.etag },
        });
      } else {
        const headers = new Headers();
        for (const name of FORWARDED_HEADERS) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
        // The destination comes exclusively from the generated map. No client
        // query, cookie, bearer token, or request body reaches asset storage.
        const target = new URL(entry.storage, env?.ASSETS?.fetch ? url.origin : STORAGE_ORIGIN);
        const assetRequest = new Request(target, { method: request.method, headers, redirect: 'manual' });
        response = env?.ASSETS?.fetch ? await env.ASSETS.fetch(assetRequest) : await upstreamFetch(assetRequest);
        if (entry.theaterVideoBytes !== undefined) response = await theaterRangeResponse(request, response, entry.theaterVideoBytes);
      }
      const headers = new Headers(response.headers);
      if ([200, 206, 304].includes(response.status)) {
        headers.set('cache-control', url.pathname === '/sw.js' ? 'no-cache, no-store, must-revalidate' :
          url.pathname.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate');
        if (url.pathname === '/sw.js') headers.set('Service-Worker-Allowed', '/');
      } else headers.set('cache-control', 'no-store');
      return secureResponse(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
    },
  };
}
