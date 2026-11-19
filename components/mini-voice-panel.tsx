/** Compatibility host for the old owner-only Pixel Linux view. */
'use client';
import { useMemo } from 'react';
import EveInteractionPanel from './eve-interaction-panel';
import { createLinuxEveWorkPort, type MiniSnapshot } from '@/lib/sky-linux-eve-work-port';
import { MINI_VOICE_PENDING } from '@/lib/mini-voice-session';
export default function MiniVoicePanel({ action, connected }: { action: (input: Record<string, unknown>) => Promise<MiniSnapshot>; connected: boolean }) {
  const work = useMemo(() => createLinuxEveWorkPort(action), [action]);
  return <EveInteractionPanel work={work} connected={connected} pendingKey={MINI_VOICE_PENDING} executionNotice="この内容を役割として保存し、このPixelで下書きを作ります。クラウドAI使用料は0円。電気代・機器代は別です。担当と依頼・成果がこのPixel内に残ります。" />;
}
