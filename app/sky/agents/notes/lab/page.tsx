import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import SkyPrivateZoomLab from '@/components/sky-private-zoom-lab';
import { skyPrivateLabAllowed } from '@/lib/sky-app-contract';

export const metadata: Metadata = {
  title: 'Sky Agent Smith — 本人用メモLab',
  robots: { index: false, follow: false },
};

export default async function PrivateNotesLabPage() {
  const requestHeaders = await headers();
  if (!skyPrivateLabAllowed(process.env.NODE_ENV, requestHeaders.get('host'))) notFound();
  return <SkyPrivateZoomLab />;
}
