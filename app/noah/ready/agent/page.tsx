import NoahReadyDetail from '@/components/noah-ready-detail';
export const metadata = { title: 'Agent の詳細 — Noah' };
// 系列の ID は `/` を含むので、パスに入れずに、query の id で受ける。
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const params = await searchParams, id = typeof params.id === 'string' ? params.id.slice(0, 400) : '';
  return <NoahReadyDetail key={id} id={id} />;
}
