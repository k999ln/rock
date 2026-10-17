import { notFound } from 'next/navigation';
import SkyWorkspace from '@/components/sky-workspace';
import { findCampus } from '@/lib/campus-sky';

export default async function CampusAgentHubPage({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const campus = findCampus((await params).campus);
  if (!campus) notFound();
  return <SkyWorkspace campusId={campus.id} />;
}
