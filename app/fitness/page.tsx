import SkyFitnessPlugin from '@/components/sky-fitness-plugin';

export const metadata = {
  title: 'マイプラン · Fitness × Sky',
  description: 'Sky Agentの保存済み成果をFitnessアプリで表示する。',
};

export default async function FitnessPage({
  searchParams,
}: {
  searchParams: Promise<{ delegation?: string; preview?: string }>;
}) {
  const { delegation, preview } = await searchParams;
  return <SkyFitnessPlugin delegationId={delegation} preview={preview === '1'} />;
}
