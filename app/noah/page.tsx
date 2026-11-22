import NoahHome from '@/components/noah-home';
import { noahShareMetadata } from '@/lib/noah-share-metadata';
import {redirect} from 'next/navigation';
import {noahPageHref,type NoahPageParams} from '@/lib/noah-page-routes';
export const metadata = noahShareMetadata('/noah');
export default async function Page({searchParams}:{searchParams:Promise<NoahPageParams>}){const p=await searchParams;if(typeof p.q==='string'&&p.q.trim())redirect(noahPageHref('explore',p));return <NoahHome mode="public"/>;}
