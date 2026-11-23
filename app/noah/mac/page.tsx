import NoahMacHandoff from '@/components/noah-mac-handoff';
import type { NoahPageParams } from '@/lib/noah-page-routes';

export const metadata = { title: 'Macをつなぐ — Noah' };

export default async function Page({ searchParams }: { searchParams: Promise<NoahPageParams> }) {
  const { agent } = await searchParams;
  return <NoahMacHandoff initialAgent={typeof agent === 'string' ? agent : undefined} />;
}
