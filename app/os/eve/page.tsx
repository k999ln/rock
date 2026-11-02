import type { Metadata } from 'next';
import EveSyncWorkspace from '@/components/eve-sync-workspace';
import SkyChatWorkspace from '@/components/sky-chat-workspace';
import { readSkyEveSelection } from '@/lib/sky-eve-connections';
export const metadata: Metadata = {
  title: 'Eve — RockstarOS',
  description: 'PixelでもWebでも、同じ会話・仕事・成果から続きを。',
};
export const dynamic = 'force-dynamic';
export default async function EvePage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    thread?: string;
    device?: string;
    deviceAgent?: string;
    agentHash?: string;
    modelHash?: string;
    runtime?: string;
    modelScheme?: string;
  }>;
}) {
  const params = await searchParams;
  return params.mode === 'tools' ? (
    <SkyChatWorkspace />
  ) : (
    <EveSyncWorkspace
      key={[
        params.device,
        params.deviceAgent,
        params.agentHash,
        params.modelHash,
        params.runtime,
        params.modelScheme,
      ].join(':')}
      initialSelection={readSkyEveSelection(params)}
      initialThreadId={
        params.thread && /^[a-f0-9-]{36}$/.test(params.thread)
          ? params.thread
          : ''
      }
    />
  );
}
