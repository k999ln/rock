import NoahPublicDetail from '@/components/noah-public-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <NoahPublicDetail id={(await params).id} />; }
