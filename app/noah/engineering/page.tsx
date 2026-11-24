import { NOAH_LOCALES } from '@/lib/noah-i18n';
import NoahEngineering from '@/components/noah-engineering';
import { noahEngineeringSelection } from '@/lib/noah-engineering';
import type { NoahPageParams } from '@/lib/noah-page-routes';

export const metadata = { title: 'Agentエンジニアリング — Noah' };

export default async function Page({ searchParams }: { searchParams: Promise<NoahPageParams> }) {
  const params = await searchParams;
  return <NoahEngineering {...noahEngineeringSelection(params)} draftLocale={NOAH_LOCALES.find(value => value === params.lang)} />;
}
