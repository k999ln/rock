import NoahInstanceDetail from '@/components/noah-instance-detail';
export default async function Page({params}:{params:Promise<{instanceId:string}>}) {
  const {instanceId}=await params; return <NoahInstanceDetail id={instanceId}/>;
}
