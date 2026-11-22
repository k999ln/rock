import NoahPublicDetail from '@/components/noah-public-detail';
import NoahAgentDetail from '@/components/noah-agent-detail';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return /^[a-f0-9-]{36}$/.test(id)?<NoahAgentDetail id={id} remote/>:<NoahPublicDetail id={id}/>;}
