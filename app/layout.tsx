import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
import './workspace.css';
import './work/work.css';
export const metadata: Metadata = {
  title: 'avocadoOS',
  description:
    'Sky、Zema、Wallet、Market、Fundを一つのホームから使うavocadoOS Developer Preview。',
  applicationName: 'avocadoOS',
  authors: [{ name: 'kaiya' }],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'avocadoOS',
  },
  icons: { icon: '/favicon.svg', apple: '/rock-icon-192.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
