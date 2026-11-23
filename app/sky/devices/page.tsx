import SkyConnectedRuntime from '@/components/sky-connected-runtime';
import type { NoahPageParams } from '@/lib/noah-page-routes';
import '../../os-design-tokens.css';
export const metadata = {
  title: '接続した担当と実行先 — Noah',
  robots: { index: false, follow: false },
};
export default async function Page({ searchParams }: { searchParams: Promise<NoahPageParams> }) {
  const { agent } = await searchParams;
  return <SkyConnectedRuntime initialAgent={typeof agent === 'string' ? agent : undefined} />;
}
