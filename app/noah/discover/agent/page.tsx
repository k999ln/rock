import NoahProjectDetail from '@/components/noah-project-detail';
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <NoahProjectDetail key={id ?? ''} id={id ?? ''} />;
}
