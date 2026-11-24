import type { Metadata } from 'next';
import EveSyncWorkspace from '@/components/eve-sync-workspace';
import SkyChatWorkspace from '@/components/sky-chat-workspace';
import { readSkyEveSelection } from '@/lib/sky-eve-connections';
import { engineeringEveDraft } from '@/lib/noah-engineering-eve';
import EveEngineeringConsultation from '@/components/eve-engineering-consultation';
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
    const device = new URLSearchParams({ mode: 'device', engineering: params.engineering });
    if (typeof params.lang === 'string') device.set('lang', params.lang);
    return <EveEngineeringConsultation draft={initialDraft} backHref={'/noah/engineering?' + new URLSearchParams({ step: params.engineering })}
      deviceHref={'/os/eve?' + device + '#eve-compose'} />;
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
