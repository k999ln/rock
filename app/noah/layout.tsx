import NoahShell from '@/components/noah-shell';
import type { Metadata } from 'next';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-origin';
export const metadata: Metadata = { metadataBase: new URL(NOAH_PUBLIC_ORIGIN), title: 'Noah — あなたのAgentワークスペース', description: 'Agentを見つけ、仕事を任せ、成果を受け取る。あなたとAgentの仕事をNoahひとつで。', applicationName: 'Noah', appleWebApp: { capable: true, title: 'Noah' }, icons: { icon: '/company-mark.png', apple: '/company-mark.png' } };
export default function Layout({children}:{children:React.ReactNode}) {return <NoahShell mode="public">{children}</NoahShell>;}
