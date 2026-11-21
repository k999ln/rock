import { NoahBoardPage } from '@/components/noah-boards';
export const metadata = { title: 'ボード — Noah' };
// 1 つのボード（持ち主か、公開のボード。task 115）。ID の形は、入口が確かめる。
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoahBoardPage id={id.slice(0, 36)} />;
}
