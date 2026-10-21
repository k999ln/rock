import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { skyPrivateLabAllowed } from '@/lib/sky-app-contract';
import SkyZoomDeviceLab from '@/components/sky-zoom-device-lab';
export const metadata = { title: 'Sky — 自分のZoomにAdd', robots: { index: false, follow: false } };
export default async function ZoomDevicePage() {
  if (!skyPrivateLabAllowed(process.env.NODE_ENV, (await headers()).get('host'))) notFound();
  return <SkyZoomDeviceLab />;
}
