import NoahMy from '@/components/noah-my';
import type { NoahPageParams } from '@/lib/noah-page-routes';

export const metadata = { title: '実行中のAgent — Noah' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<NoahPageParams>;
}) {
  return <NoahMy params={await searchParams} legacy="activity" />;
}
