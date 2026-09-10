import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
import './workspace.css';
export const metadata: Metadata = {
  title: 'RockstarOS — 自動化Hub',
  description:
    '自分の仕事に合うツールを選び、実行して、結果を確かめる。RockstarOSの自動化HubとDeveloper Preview。',
  applicationName: 'RockstarOS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RockstarOS',
  },
  icons: { icon: '/favicon.svg', apple: '/rock-icon-192.png' },
};
export const viewport: Viewport = {
  themeColor: '#171a1b',
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
