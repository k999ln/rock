import { permanentRedirect } from 'next/navigation';
import { noahMarketplaceHref } from '@/lib/noah-marketplace-view';
import type { NoahPageParams } from '@/lib/noah-page-routes';
export default async function Page({ searchParams }: { searchParams: Promise<NoahPageParams> }) {
  permanentRedirect(noahMarketplaceHref(await searchParams));
}
