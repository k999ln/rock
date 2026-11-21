import NoahReadyDetail from '@/components/noah-ready-detail';
import NoahTrialEntry from '@/components/noah-trial-entry';
export const metadata = { title: 'Agent の詳細 — Noah' };
const PACKAGE_ID = /^pkg:[a-z0-9][a-z0-9-]{1,62}$/u;
// 系列の ID は `/` を含むので、パスに入れずに、query の id で受ける。tool は、棚のカードから来た時に、最初に選んでおく道具（無い・使えない道具なら、選ばない）。
// from は、棚のカードの ID（試行の本人の報告を、その下に出す）。via は、試行の経路の札。
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string | string[]; tool?: string | string[]; from?: string | string[]; via?: string | string[] }> }) {
  const params = await searchParams, id = typeof params.id === 'string' ? params.id.slice(0, 400) : '';
  const tool = typeof params.tool === 'string' && params.tool.length <= 128 ? params.tool : null;
  const from = typeof params.from === 'string' && PACKAGE_ID.test(params.from) ? params.from : null;
  const via = typeof params.via === 'string' ? params.via.slice(0, 40) : null;
  return <><NoahTrialEntry via={via} /><NoahReadyDetail key={id} id={id} tool={tool} from={from} /></>;
}
