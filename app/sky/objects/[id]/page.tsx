import SkyAttachedObject from '@/components/sky-attached-object';
export const metadata = { title: 'この担当 — Smith', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkyAttachedObject key={id} agentId={id} />;
}
