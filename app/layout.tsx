import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
import './workspace.css';
export const metadata: Metadata = {
  title: 'RockstarOS — Sky',
  description:
    '自動化ツールを選び、権限・料金・実行先を確認し、実行・停止・結果まで管理する。RockstarOSのSkyとDeveloper Preview。',
  applicationName: 'RockstarOS',
  authors: [{ name: 'kaiya' }],
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
