import { redirect } from 'next/navigation';
import { noahPageHref, type NoahPageParams } from '@/lib/noah-page-routes';
export default async function Page({searchParams}:{searchParams:Promise<NoahPageParams>}) {redirect(noahPageHref('saved',await searchParams,'results'));}
