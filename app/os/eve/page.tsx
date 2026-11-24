import type { Metadata } from 'next';
import EveSyncWorkspace from '@/components/eve-sync-workspace';
import SkyChatWorkspace from '@/components/sky-chat-workspace';
import { readSkyEveSelection } from '@/lib/sky-eve-connections';
import { eveEngineeringNavigation } from '@/lib/eve-engineering-navigation';
import { engineeringEveDraft } from '@/lib/noah-engineering-eve';
import { redirect } from 'next/navigation';
export const metadata: Metadata = {
  title: 'Eve — RockstarOS',
  description: 'PixelでもWebでも、同じ会話・仕事・成果から続きを。',
  applicationName: 'Eve',
  manifest: '/connect/eve.webmanifest',
  appleWebApp: { capable: true, title: 'Eve', statusBarStyle: 'default' },
};
export const dynamic = 'force-dynamic';
export default async function EvePage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    engineering?: string;
    lang?: string;
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
  const initialDraft = engineeringEveDraft(params.engineering, params.lang);
  if (initialDraft && params.engineering && !params.mode && !params.device && !params.thread) {
    redirect(eveEngineeringNavigation(params.engineering, params.lang).consultation);
  }
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
        initialDraft,
      ].join(':')}
      initialDraft={initialDraft}
      initialSelection={readSkyEveSelection(params)}
      initialThreadId={
        params.thread && /^[a-f0-9-]{36}$/.test(params.thread)
          ? params.thread
          : ''
      }
    />
  );
}
