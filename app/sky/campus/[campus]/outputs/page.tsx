import { notFound } from 'next/navigation';
import SkyOutputCenter from '@/components/sky-output-center';
import { findCampus } from '@/lib/campus-sky';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const campus = findCampus((await params).campus);
  return { title: campus ? `成果 · ${campus.shortName} Smith` : '成果 · Smith' };
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
