import NoahProjectDetail from '@/components/noah-project-detail';
import { GET } from '@/app/api/noah/discover/project/route';
import type { NoahProjectDetail as Detail } from '@/lib/noah-project-view';
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; firstJob?: string | string[] }> }) {
  const { id = '', firstJob } = await searchParams;
  const intent = firstJob === undefined ? undefined : typeof firstJob === 'string' && firstJob.length > 0 && firstJob.length <= 40 ? firstJob : 'invalid';
  const response = await GET(new Request(`https://avoado.si/api/noah/discover/project?${new URLSearchParams(intent ? { id, firstJob: intent } : { id })}`));
  const initialDetail = response.ok ? await response.json() as Detail : undefined;
  return <NoahProjectDetail key={JSON.stringify([id, intent])} id={id} firstJob={intent} initialDetail={initialDetail} />;
}
