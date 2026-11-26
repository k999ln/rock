import type { NextConfig } from 'next';
import { NOAH_REDIRECTS, NOAH_SHORT_PAGES } from './services/sky-web/noah-page-routes.mjs';
import webSecurityPolicy from './data/web-security-policy.json' with { type: 'json' };

export const WEB_SECURITY_RESPONSE_HEADERS = Object.entries(
  webSecurityPolicy.universalHeaders,
).map(([key, value]) => ({ key, value }));

const nextConfig: NextConfig = {
  async redirects() {
    return NOAH_REDIRECTS.map(([source, destination]) => ({ source, destination, permanent: true, has: [{ type: 'host' as const, value: '(avoado\\.si|localhost|127\\.0\\.0\\.1|\\[::1\\])(:[0-9]+)?' }] }));
  },
  async rewrites() {
    return NOAH_SHORT_PAGES.map(([source, destination]) => ({
      source,
      destination,
      has: [{ type: 'host' as const, value: '(avoado\\.si|sky-marketplace\\.noellesugar1\\.chatgpt\\.site|localhost|127\\.0\\.0\\.1|\\[::1\\])(:[0-9]+)?' }],
    }));
  },
  async headers() {
    return [
      {
        source: '/',
        headers: [...WEB_SECURITY_RESPONSE_HEADERS],
      },
      {
        source: '/:path*',
        headers: [...WEB_SECURITY_RESPONSE_HEADERS],
      },
      ...Object.entries(webSecurityPolicy.routeHeaders).map(([source, headers]) => ({
        source: source.endsWith('/*') ? source.replace(/\/\*$/, '/:path*') : source,
        headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
      })),
    ];
  },
};

export default nextConfig;
