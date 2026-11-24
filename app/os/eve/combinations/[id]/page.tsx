import { redirect } from 'next/navigation';
import { eveEngineeringNavigation } from '@/lib/eve-engineering-navigation';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ engineering?: string; lang?: string }> };
export default async function Page({ params, searchParams }: Props) {
  const [{ id }, { engineering, lang }] = await Promise.all([params, searchParams]);
  const links = eveEngineeringNavigation(engineering, lang);
  redirect(`/noah/engineering/combinations/${encodeURIComponent(id)}${links.search}`);
}
