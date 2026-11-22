import NoahTaskDetail from '@/components/noah-task-detail';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <NoahTaskDetail key={id} id={id}/>;}
