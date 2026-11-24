import ApplicationRuntime from '@/components/application-runtime';
import './community-os.css';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
import './workspace.css';
import './work/work.css';
import './os-shell.css';
export const metadata: Metadata = {
  title: 'Noah・Eve',
  description:
    'NoahでAgentを見つけ、Eveと相談し、仕事の成果を受け取る。',
  applicationName: 'Noah・Eve',
  manifest: '/manifest.webmanifest',
  authors: [{ name: 'kaiya' }],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Noah・Eve',
  },
  icons: { icon: '/brand/noah-icon-v2.png', apple: '/brand/noah-icon-v2.png' },
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
      <body><ApplicationRuntime />{children}</body>
    </html>
  );
}
