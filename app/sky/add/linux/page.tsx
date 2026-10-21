import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import SkyLinuxLocalLab from '@/components/sky-linux-local-lab';
import { skyPrivateLabAllowed } from '@/lib/sky-app-contract';

export const metadata: Metadata = { title: 'Sky — 自分のLinuxで使う', robots: { index: false, follow: false } };
export default async function LinuxLocalPage() {
  const h = await headers();
  if (!skyPrivateLabAllowed(process.env.NODE_ENV, h.get('host'))) notFound();
  return <SkyLinuxLocalLab />;
}
