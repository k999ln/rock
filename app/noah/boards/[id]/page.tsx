import { redirect } from 'next/navigation';
import { noahPageHref } from '@/lib/noah-page-routes';
export default async function Page({params}:{params:Promise<{id:string}>}) {redirect(noahPageHref('saved',{board:(await params).id},'boards'));}
