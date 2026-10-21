import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import SkyWorkspace from '@/components/sky-workspace';
import { CAMPUSES, CAMPUS_IDS, type CampusId } from '@/lib/campus';
import ColumbiaFeed from './columbia-feed';

type Props = { params: Promise<{ campusId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { campusId } = await params;
  const entry = campusId === 'columbia' ? SKY_CAMPUS_ENTRIES.columbia : null;
  if (entry) return { title: entry.heading, description: entry.description };
  if (CAMPUS_IDS.includes(campusId as CampusId)) {
    const campus = CAMPUSES[campusId as CampusId];
    return { title: `${campus.shortName} · Sky`, description: campus.description };
  }
  return { title: 'Sky Campus' };
}

export default async function SkyCampusPage({ params }: Props) {
  const { campusId } = await params;
  const entry = campusId === 'columbia' ? SKY_CAMPUS_ENTRIES.columbia : null;
  if (entry) return <ColumbiaFeed />;
  if (!CAMPUS_IDS.includes(campusId as CampusId)) notFound();
  return <SkyWorkspace campusId={campusId as CampusId} />;
}
