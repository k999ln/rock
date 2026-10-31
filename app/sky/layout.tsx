import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'Noah',
  manifest: '/os/sky/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Noah',
  },
};

export default function SkyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
