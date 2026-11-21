import NoahRegistrationBrowser from '@/components/noah-registration-browser';
export const metadata={title:'登録の確認 — Noah'};
export default async function Page({searchParams}:{searchParams:Promise<{job?:string;provider?:string}>}){
  const params=await searchParams;return <NoahRegistrationBrowser job={typeof params.job==='string'?params.job:''} provider={typeof params.provider==='string'?params.provider:''}/>;
}
