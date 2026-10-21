import type { Metadata } from 'next';
import EveSyncWorkspace from '@/components/eve-sync-workspace';
import SkyChatWorkspace from '@/components/sky-chat-workspace';
export const metadata:Metadata={title:'Eve — RockstarOS',description:'PixelでもWebでも、同じ会話・仕事・成果から続きを。'};
export const dynamic='force-dynamic';
export default async function EvePage({searchParams}:{searchParams:Promise<{mode?:string}>}){const params=await searchParams;return params.mode==='tools'?<SkyChatWorkspace/>:<EveSyncWorkspace/>;}
