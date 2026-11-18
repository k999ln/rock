import { secureResponse } from './domain-router.mjs';

// Sites may serve a matching static file before invoking the Worker, ignoring
// Wrangler's run_worker_first. Build-time relocation leaves canonical URLs to
// this handler. The backing files contain public bytes, never owner data.
const STORAGE_ORIGIN = 'https://sky-marketplace.noellesugar1.chatgpt.site';
const FORWARDED_HEADERS = ['range', 'if-range', 'if-none-match', 'if-modified-since'];

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
