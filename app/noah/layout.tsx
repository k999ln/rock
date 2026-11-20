import NoahShell from '@/components/noah-shell';
import type { Metadata } from 'next';
import { webBrandIcons } from '@/lib/web-brand';
export const metadata: Metadata = { title: 'Noah — あなたのAgentワークスペース', description: 'Agentを見つけ、仕事を任せ、成果を受け取る。あなたとAgentの仕事をNoahひとつで。', applicationName: 'Noah', appleWebApp: { capable: true, title: 'Noah' }, icons: webBrandIcons };
export default function Layout({children}:{children:React.ReactNode}) {return <NoahShell mode="public">{children}</NoahShell>;}
