import NoahRegistration from '@/components/noah-registration';
export const metadata = { title: '外部Agentの登録 — Noah' };
export default async function Page({ searchParams }: { searchParams: Promise<{ agent?: string | string[] }> }) {
  const params = await searchParams;
  return <NoahRegistration agentId={typeof params.agent === 'string' ? params.agent.slice(0, 200) : ''} />;
}
