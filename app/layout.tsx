import type { Metadata, Viewport } from 'next';
import './globals.css';
import './community-os.css';
import CommunityOsRuntime from '@/components/community-os-runtime';
import './app.css';
import './workspace.css';
import './work/work.css';
export const metadata: Metadata = {
  title: 'RockstarOS',
  description:
    'Sky、Zema、Wallet、Market、Fundを一つのホームから使うRockstarOS Developer Preview。',
  applicationName: 'RockstarOS',
  authors: [{ name: 'kaiya' }],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RockstarOS',
  },
  icons: { icon: '/favicon.svg', apple: '/company-mark.png' },
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
      <body><CommunityOsRuntime />{children}</body>
    </html>
  );
}
