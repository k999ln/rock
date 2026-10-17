import { notFound } from 'next/navigation';
import CampusSky from '@/components/campus-sky';
import { findCampus } from '@/lib/campus-sky';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const campus = findCampus((await params).campus);
  return {
    title: campus
      ? `${campus.shortName} · Sky by avocado`
      : 'Campus not found · Sky',
  };
}
export default async function CampusSkyPage({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const campus = findCampus((await params).campus);
  if (!campus) notFound();
  return <CampusSky campus={campus} />;
}
