import NoahReadyDetail from '@/components/noah-ready-detail';
export const metadata = { title: 'Agent の詳細 — Noah' };
// 系列の ID は `/` を含むので、パスに入れずに、query の id で受ける。tool は、棚のカードから来た時に、最初に選んでおく道具（無い・使えない道具なら、選ばない）。
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string | string[]; tool?: string | string[] }> }) {
  const params = await searchParams, id = typeof params.id === 'string' ? params.id.slice(0, 400) : '';
  const tool = typeof params.tool === 'string' && params.tool.length <= 128 ? params.tool : null;
  return <NoahReadyDetail key={id} id={id} tool={tool} />;
}
