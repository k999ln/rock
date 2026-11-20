import NoahDeveloperMaintenance from '@/components/noah-developer-maintenance';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const q = await searchParams;
  return (
    <NoahDeveloperMaintenance
      initialAgent={
        typeof q.agent === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(q.agent)
          ? q.agent
          : ''
      }
    />
  );
}
