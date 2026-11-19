import NoahReleaseDetail from '@/components/noah-release-detail';
export default async function Page({ params }: { params: Promise<{ digest: string }> }) {
  const { digest } = await params;
  return <NoahReleaseDetail key={digest} digest={digest} />;
}
