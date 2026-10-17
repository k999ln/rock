import { notFound } from 'next/navigation';
import SkyOutputCenter from '@/components/sky-output-center';
import { findCampus } from '@/lib/campus-sky';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const campus = findCampus((await params).campus);
  return { title: campus ? `成果 · ${campus.shortName} Sky` : '成果 · Sky' };
}

export default async function CampusSkyOutputsPage({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const campus = findCampus((await params).campus);
  if (!campus) notFound();
  return <SkyOutputCenter campusId={campus.id} />;
}
