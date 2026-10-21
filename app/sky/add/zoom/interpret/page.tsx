import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { skyPrivateLabAllowed } from '@/lib/sky-app-contract';
import SkyZoomNativeTranslationGuide from '@/components/sky-zoom-native-translation-guide';

export const metadata = { title: 'Sky — Zoom通訳', robots: { index: false, follow: false } };
export default async function ZoomInterpretPage() {
  if (!skyPrivateLabAllowed(process.env.NODE_ENV, (await headers()).get('host'))) notFound();
  return <SkyZoomNativeTranslationGuide />;
}
