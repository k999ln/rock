import NoahShell from '@/components/noah-shell';
import type { Metadata } from 'next';
import { webBrandIcons } from '@/lib/web-brand';
export const metadata: Metadata = { title: 'Noah — ニュース・つながり・Agent', description: 'ニュース、Agent、コミュニティーの投稿を一つのタイムラインで。', icons: webBrandIcons };
export default function Layout({children}:{children:React.ReactNode}) {return <NoahShell mode="public">{children}</NoahShell>;}
