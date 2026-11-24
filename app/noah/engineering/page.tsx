import NoahEngineering from '@/components/noah-engineering';
import { noahEngineeringSelection } from '@/lib/noah-engineering';
import type { NoahPageParams } from '@/lib/noah-page-routes';

export const metadata = { title: 'Agentエンジニアリング — Noah' };

export default async function Page({ searchParams }: { searchParams: Promise<NoahPageParams> }) {
  return <NoahEngineering {...noahEngineeringSelection(await searchParams)} />;
}
