import NoahLaunch from '@/components/noah-launch';

export const metadata = {
  title: '仕事の詳細 — Noah',
  robots: { index: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NoahLaunch key={id} workId={id} />;
}
