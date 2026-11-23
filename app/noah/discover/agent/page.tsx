import NoahProjectDetail from '@/components/noah-project-detail';
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; firstJob?: string | string[] }> }) {
  const { id = '', firstJob } = await searchParams;
  const intent = firstJob === undefined ? undefined : typeof firstJob === 'string' && firstJob.length > 0 && firstJob.length <= 40 ? firstJob : 'invalid';
  return <NoahProjectDetail key={JSON.stringify([id, intent])} id={id} firstJob={intent} />;
}
