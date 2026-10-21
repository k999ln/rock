import type { NextConfig } from 'next';
import webSecurityPolicy from './data/web-security-policy.json' with { type: 'json' };

export const WEB_SECURITY_RESPONSE_HEADERS = Object.entries(
  webSecurityPolicy.universalHeaders,
).map(([key, value]) => ({ key, value }));

const nextConfig: NextConfig = {
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
