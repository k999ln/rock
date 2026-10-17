import { notFound } from 'next/navigation';
import SkyChatWorkspace from '@/components/sky-chat-workspace';
import { findCampus } from '@/lib/campus-sky';

export default async function CampusZemaPage({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const campus = findCampus((await params).campus);
  if (!campus) notFound();
  return <SkyChatWorkspace campusId={campus.id} />;
}
