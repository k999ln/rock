import NoahHome from '@/components/noah-home';
import {redirect} from 'next/navigation';
import {noahPageHref,type NoahPageParams} from '@/lib/noah-page-routes';
export default async function Page({searchParams}:{searchParams:Promise<NoahPageParams>}){const p=await searchParams;if(typeof p.q==='string'&&p.q.trim())redirect(noahPageHref('explore',p));return <NoahHome mode="public"/>;}
