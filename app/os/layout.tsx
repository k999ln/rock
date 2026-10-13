import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'RockstarOS',
  manifest: '/os/manifest.webmanifest',
};

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
