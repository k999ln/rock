import NoahMacHandoff from '@/components/noah-mac-handoff';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const q = await searchParams;
  return (
    <NoahMacHandoff initialAgent={typeof q.agent === 'string' ? q.agent : ''} />
  );
}
