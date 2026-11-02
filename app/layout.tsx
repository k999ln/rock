import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
import './workspace.css';
import './work/work.css';
import './os-shell.css';
export const metadata: Metadata = {
  title: 'RockstarOS',
  description:
    'smisとEveの会話・仕事・成果を同じアカウントで引き継ぐRockstarOS WebOS Developer Preview。',
  applicationName: 'RockstarOS',
  authors: [{ name: 'kaiya' }],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RockstarOS',
  },
  icons: { icon: '/brand/rainbow-icon-transparent.svg', apple: '/brand/rainbow-logo-192.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
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
