import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
export const metadata: Metadata = {
  title: 'LOOP — 自動化アプリ',
  description: 'ファンドを選び、自動化をワンボタンで実行できるLOOPアプリ。',
  applicationName: 'LOOP',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LOOP',
  },
  icons: { icon: '/loop-icon-192.png', apple: '/loop-icon-192.png' },
};
export const viewport: Viewport = {
  themeColor: '#101a2f',
  viewportFit: 'cover',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
