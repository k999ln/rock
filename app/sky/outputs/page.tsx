import SkyOutputCenter from '@/components/sky-output-center';

export const metadata = {
  title: '成果 · Sky',
  description: '保存済みAgent成果を確認し、対応アプリへ渡す。',
};

export default async function SkyOutputsPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job } = await searchParams;
  return <SkyOutputCenter initialWorkJobId={typeof job === 'string' ? job : undefined} />;
}
