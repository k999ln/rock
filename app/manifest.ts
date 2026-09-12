import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RockstarOS',
    short_name: 'RockstarOS',
    description: 'Sky、Chat、Wallet、Polymarketを一つのホームから開く。',
    start_url: '/',
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#111827',
    orientation: 'portrait-primary',
    icons: [
      { src: '/rock-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/rock-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
