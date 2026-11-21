import NoahReadyDetail from '@/components/noah-ready-detail';
export const metadata = { title: 'Agentを使う — Noah' };
export default async function Page({searchParams}:{searchParams:Promise<{id?:string|string[]}>}){
  const params=await searchParams;
  return <NoahReadyDetail key={typeof params.id==='string'?params.id:''} agentId={typeof params.id==='string'?params.id:''}/>;
}
