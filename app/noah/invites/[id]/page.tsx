import type { Metadata } from 'next';
import { NoahSharedDetail } from '@/components/noah-invites';

export const metadata: Metadata = {
  title: '限定共有 — Noah',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoahSharedDetail key={id} id={id} />;
}
