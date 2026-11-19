import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
import './workspace.css';
import './os-design-tokens.css';
import './os-appearance.css';
import './community-os.css';
import CommunityOsRuntime from '@/components/community-os-runtime';
import './work/work.css';
import './os-shell.css';
export const metadata: Metadata = {
  title: 'RockstarOS',
  description:
    'Smith、Eve、Wallet、Market、Fundを一つのホームから使うRockstarOS Developer Preview。',
  applicationName: 'RockstarOS',
  authors: [{ name: 'kaiya' }],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RockstarOS',
  },
  icons: { icon: '/company-mark.png', apple: '/company-mark.png' },
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
      <body><CommunityOsRuntime/>{children}</body>
    </html>
  );
}
