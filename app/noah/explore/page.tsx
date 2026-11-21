import NoahReady from '@/components/noah-ready';
import NoahShelf from '@/components/noah-shelf';
export const metadata = { title: 'Agentを探す — Noah' };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams, query = typeof params.q === 'string' ? params.q.slice(0, 120) : '';
  return <NoahReady key={query} initialQuery={query} shelf={<NoahShelf />} />;
}
