import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'smis',
  manifest: '/os/sky/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'smis',
  },
};

export default function SkyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
