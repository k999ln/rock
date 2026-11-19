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
      ...(process.env.SMIS_MODULE_PRIVATE_PREVIEW === '1' && process.env.NODE_ENV === 'development' ? [{
        source: '/os/eve/module',
        has: [{ type: 'host' as const, value: '(localhost|127\\.0\\.0\\.1|\\[::1\\])(:[0-9]+)?' }],
        headers: [
          { key: 'Permissions-Policy', value: 'bluetooth=(self), camera=(), geolocation=(), hid=(), microphone=(self), payment=(), serial=(), usb=()' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      }] : []),
    ];
  },
};

export default nextConfig;
