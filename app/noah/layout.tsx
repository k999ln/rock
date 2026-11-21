import { NoahLocaleProvider } from '@/components/noah-locale';
import NoahShell from '@/components/noah-shell';
import { NoahInteraction } from '@/components/noah-interaction';
import type { Metadata } from 'next';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-origin';
import NoahBrowserAccess from '@/components/noah-browser-access';
export const metadata: Metadata = { metadataBase: new URL(NOAH_PUBLIC_ORIGIN), title: 'Noah — あなたのAgentワークスペース', description: 'Agentを見つけ、仕事を任せ、成果を受け取る。あなたとAgentの仕事をNoahひとつで。', applicationName: 'Noah', appleWebApp: { capable: true, title: 'Noah' }, icons: { icon: { url: '/brand/noah-icon-transparent.svg', type: 'image/svg+xml' }, apple: '/company-mark.png' } };
export default function Layout({children}:{children:React.ReactNode}) {return <NoahLocaleProvider><NoahInteraction><NoahBrowserAccess><NoahShell mode="public">{children}</NoahShell></NoahBrowserAccess></NoahInteraction></NoahLocaleProvider>;}
