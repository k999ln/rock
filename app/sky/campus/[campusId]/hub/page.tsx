import { notFound } from 'next/navigation';
import SkyWorkspace from '@/components/sky-workspace';
import { CAMPUSES, CAMPUS_IDS, type CampusId } from '@/lib/campus';

type Props = { params: Promise<{ campusId: string }> };

export async function generateMetadata({ params }: Props) {
  const { campusId } = await params;
  if (!CAMPUS_IDS.includes(campusId as CampusId)) return { title: 'Sky Campus' };
  const campus = CAMPUSES[campusId as CampusId];
  return { title: `${campus.shortName} · Sky`, description: campus.description };
}

export default async function CampusSkyHub({ params }: Props) {
  const { campusId } = await params;
  if (!CAMPUS_IDS.includes(campusId as CampusId)) notFound();
  return <SkyWorkspace campusId={campusId as CampusId} />;
}
