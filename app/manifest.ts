import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RockstarOS Sky',
    short_name: 'RockstarOS',
    description: 'ツールを選び、実行して、結果と収支の記録を確認。',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f9f7',
    theme_color: '#171a1b',
    orientation: 'portrait-primary',
    icons: [
      { src: '/rock-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/rock-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
