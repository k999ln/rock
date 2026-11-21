import NoahPublicCatalog from '@/components/noah-public-catalog';
import type { Metadata } from 'next';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-guide';

export const metadata: Metadata = {
  title: 'Agentを探す・配布元と利用条件を見る — Noah',
  description: 'Noahの公開カタログでAgentを検索し、作者、配布元、ライセンス、利用条件を確認できます。',
  alternates: { canonical: `${NOAH_PUBLIC_ORIGIN}/noah/agents` },
};

export default function Page() { return <NoahPublicCatalog embedded />; }
