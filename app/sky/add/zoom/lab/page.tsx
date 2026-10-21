import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import SkyPrivateZoomLab from '@/components/sky-private-zoom-lab';
import { privateZoomLabAllowed } from '@/lib/sky-private-zoom-lab';

export const metadata: Metadata = {
  title: 'Sky — 本人用Zoom Agent Lab',
  robots: { index: false, follow: false },
};

export default async function PrivateZoomLabPage() {
  const requestHeaders = await headers();
  if (!privateZoomLabAllowed(process.env.NODE_ENV, requestHeaders.get('host'))) notFound();
  return <SkyPrivateZoomLab />;
}
