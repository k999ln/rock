import WorkspaceShell from '@/components/workspace-shell';
import { SkyAgentShareCard } from '@/components/sky-agent-share';
export default async function SharedAgentPage({searchParams}:{searchParams:Promise<{ref?:string}>}) {
 const q=await searchParams;
 return <WorkspaceShell tone="sky" title="共有された担当"><SkyAgentShareCard key={q.ref??''} resource={q.ref??''}/></WorkspaceShell>;
}
