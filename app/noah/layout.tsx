import { NoahLocaleProvider } from '@/components/noah-locale';
import NoahShell from '@/components/noah-shell';
import { NoahInteraction } from '@/components/noah-interaction';
import type { Metadata, Viewport } from 'next';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-origin';
import NoahBrowserAccess from '@/components/noah-browser-access';
export const viewport: Viewport = { themeColor: '#fff8f1' };
export const metadata: Metadata = { metadataBase: new URL(NOAH_PUBLIC_ORIGIN), title: 'Noah — Agentストア', description: 'Agentを見つけ、仕事を任せ、成果を受け取る。あなたとAgentの仕事をNoahひとつで。', applicationName: 'Noah', appleWebApp: { capable: true, title: 'Noah' }, icons: { icon: { url: '/brand/noah-orange-icon.png', type: 'image/png' }, apple: '/brand/noah-orange-icon.png' } };
export default function Layout({children}:{children:React.ReactNode}) {return <NoahLocaleProvider><NoahInteraction><NoahBrowserAccess><NoahShell mode="public">{children}</NoahShell></NoahBrowserAccess></NoahInteraction></NoahLocaleProvider>;}
