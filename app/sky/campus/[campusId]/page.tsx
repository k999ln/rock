import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import ColumbiaFeed from './columbia-feed';

type Props = { params: Promise<{ campusId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { campusId } = await params;
  const entry = campusId === 'columbia' ? SKY_CAMPUS_ENTRIES.columbia : null;
  return entry
    ? { title: entry.heading, description: entry.description }
    : { title: 'Sky Campus' };
}

export default async function SkyCampusPage({ params }: Props) {
  const { campusId } = await params;
  const entry = campusId === 'columbia' ? SKY_CAMPUS_ENTRIES.columbia : null;
  if (!entry) notFound();
  return <ColumbiaFeed />;
}
