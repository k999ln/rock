import NoahSaved from '@/components/noah-saved';
import type { NoahPageParams } from '@/lib/noah-page-routes';
export const metadata={title:'保存したもの — Noah'};
export default async function Page({searchParams}:{searchParams:Promise<NoahPageParams>}) {return <NoahSaved params={await searchParams}/>;}
