import type { Metadata } from 'next';
import SkyToolWorkspace from '@/components/sky-tool-workspace';
import { catalog } from '@/lib/catalog';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';

type Props = {
  params: Promise<{ toolId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { toolId } = await params;
  const query = (await searchParams) ?? {};
  const englishTitles: Record<string, string> = {
    'mr-citations': 'Citations',
    'rockstar-amc': 'AMC',
    'rockstar-patent-assistant': 'Patent Assistant',
  };
  const cardEntry = query.lang === 'en' && query.entry === 'columbia-card';
  if (cardEntry) {
    const cardTool = SKY_CAMPUS_ENTRIES.columbia.tools.find((item) => item.id === toolId);
    if (cardTool) return { title: `${cardTool.title} — Sky for Columbia students`, description: cardTool.description };
  }
  if (query.lang === 'en' && englishTitles[toolId])
    return { title: `${englishTitles[toolId]} — Sky`, description: 'English Sky tool workspace.' };
  const tool = catalog.find((item) => item.id === toolId);
  return { title: tool ? `${tool.name} — Sky` : 'Sky Tool — avocadoOS' };
}

export default async function SkyToolPage({
  params,
  searchParams,
}: Props) {
  const { toolId } = await params;
  const query = (await searchParams) ?? {};
  const lang = query.lang === 'en' || (Array.isArray(query.lang) && query.lang.includes('en')) ? 'en' : 'ja';
  const entry = query.entry === 'columbia-card' || (Array.isArray(query.entry) && query.entry.includes('columbia-card'))
    ? 'columbia-card'
    : undefined;
  return <SkyToolWorkspace toolId={toolId} language={lang} entry={entry} />;
}
