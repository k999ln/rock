import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LOOP 自動化アプリ',
    short_name: 'LOOP',
    description: 'ファンドを選び、自動化をワンボタンで実行。',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: '#111827',
    orientation: 'portrait-primary',
    icons: [
      { src: '/loop-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/loop-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
