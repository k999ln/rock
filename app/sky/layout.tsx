import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'Sky',
  manifest: '/sky/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Sky',
  },
};

export default function SkyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
