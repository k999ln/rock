import NoahUsageDashboard from '@/components/noah-usage-dashboard';

export const metadata = { title: 'Agentの利用状況 — Noah' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[]; agent?: string | string[] }>;
}) {
  const query = await searchParams;
  const initialScope = query.scope === 'publisher' ? 'publisher' : 'personal';
  const agent = typeof query.agent === 'string' ? query.agent : '';
  return <NoahUsageDashboard key={initialScope + '/' + agent} initialScope={initialScope} agent={agent} />;
}
