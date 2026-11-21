import NoahWorkPage from '@/components/noah-work-page';
import { redirect } from 'next/navigation';
export const metadata = { title: '実行中のAgent — Noah' };
export default async function Page({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const params = await searchParams;
  if (typeof params.agent === 'string' && params.agent) redirect(`/noah/mac/activity?${new URLSearchParams({ agent: params.agent })}`);
  return <NoahWorkPage/>;
}
