import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'Smith',
  manifest: '/sky/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Smith',
  },
};

export default function SkyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
