import type { Metadata } from 'next';
import '../os-design-tokens.css';
import '../community-os.css';

export const metadata: Metadata = {
  applicationName: 'RockstarOS',
  manifest: '/os/manifest.webmanifest',
};

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
