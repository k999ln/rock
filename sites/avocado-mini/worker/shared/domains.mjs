const productPages = {
  'avocadomini.si': '/_site-pages/mini/',
  'avocadopro.si': '/_site-pages/pro/',
};

const legacyProducts = {
  '/mini': 'avocadomini.si',
  '/mini/': 'avocadomini.si',
  '/mini/index.html': 'avocadomini.si',
  '/pro': 'avocadopro.si',
  '/pro/': 'avocadopro.si',
  '/pro/index.html': 'avocadopro.si',
};

// Serve each product at its own domain root while sharing the same assets and APIs.
export async function serveSite(request, env) {
  const url = new URL(request.url);
  const productPage = productPages[url.hostname];
  if (request.method === 'GET' || request.method === 'HEAD') {
    const legacyHost = legacyProducts[url.pathname];
    if (legacyHost) {
      return Response.redirect(`https://${legacyHost}/${url.search}`, 308);
    }
    if (url.pathname === '/index.html') {
      return Response.redirect(`https://${url.hostname}/${url.search}`, 308);
    }
    if (productPage && (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml')) {
      const sitemap = url.pathname === '/sitemap.xml';
      const body = sitemap
        ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${url.hostname}/</loc></url></urlset>\n`
        : `User-agent: *\nAllow: /\n\nSitemap: https://${url.hostname}/sitemap.xml\n`;
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { 'content-type': sitemap ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8' },
      });
    }
    if (url.pathname === '/') {
      url.pathname = productPage || '/_site-pages/home/';
      request = new Request(url, request);
    } else if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
      url.pathname = `/_site-pages${url.pathname}`;
      request = new Request(url, request);
    }
  }
  return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Assets unavailable', { status: 503 });
}
