import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'RockstarOS',
    short_name: 'RockstarOS',
    description: 'Sky、Chat、Wallet、Market、Fundを一つのホームから開く。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'ja',
    dir: 'ltr',
    background_color: '#111827',
    theme_color: '#111827',
    orientation: 'portrait-primary',
    categories: ['productivity', 'utilities'],
    prefer_related_applications: false,
    icons: [
      {
        src: '/rock-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/rock-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/rock-icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
