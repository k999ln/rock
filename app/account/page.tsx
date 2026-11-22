import RockstarAccount from '@/components/rockstar-account';
import { redirect } from 'next/navigation';
import { noahAccountHref } from '@/lib/noah-navigation';
export const dynamic = 'force-dynamic';
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; mode?: string }> }) {
  const params = await searchParams;
  if (typeof params.returnTo === 'string' && /^\/noah(?:\/|$)/.test(params.returnTo)) {
    redirect(noahAccountHref(params.returnTo) + (params.mode === 'login' ? '&mode=login' : ''));
  }
  return <RockstarAccount />;
}
