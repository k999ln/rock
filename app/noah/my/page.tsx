import NoahMy from '@/components/noah-my';
import type { NoahPageParams } from '@/lib/noah-page-routes';
import { noahMySelection, noahMyTitles } from '@/lib/noah-my-routes';

type PageProps = { searchParams: Promise<NoahPageParams> };

export async function generateMetadata({ searchParams }: PageProps) {
  const { view } = noahMySelection(await searchParams);
  return { title: `${noahMyTitles[view]} — Noah` };
}

export default async function Page({ searchParams }: PageProps) {
  return <NoahMy params={await searchParams} />;
}
