import { redirect } from 'next/navigation';
import { eveEngineeringNavigation } from '@/lib/eve-engineering-navigation';

export default async function Page({ searchParams }: { searchParams: Promise<{ engineering?: string; lang?: string }> }) {
  const { engineering, lang } = await searchParams;
  redirect(eveEngineeringNavigation(engineering, lang).catalog);
}
