/** Compatibility entry for the first private Pixel preview; orchestration lives in the OS core. */
import { createEveInteractionSession } from './rockstar-eve-interaction.ts';
import { createLinuxEveWorkPort, type MiniSnapshot } from './sky-linux-eve-work-port.ts';
export { eveInteractionCommand as miniVoiceCommand } from './rockstar-eve-interaction.ts';
export type { EveInteractionPhase as MiniVoicePhase, EveInteractionState as MiniVoiceState } from './rockstar-eve-interaction.ts';
export type { MiniSnapshot } from './sky-linux-eve-work-port.ts';
// Retain existing pending records without copying them into a second store.
export const MINI_VOICE_PENDING = 'smis.mini.voice.pending.v1';
export function createMiniVoiceSession(options: { action: (input: Record<string, unknown>) => Promise<MiniSnapshot>; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; changed: Parameters<typeof createEveInteractionSession>[0]['changed'] }) {
  return createEveInteractionSession({ ...options, work: createLinuxEveWorkPort(options.action), pendingKey: MINI_VOICE_PENDING });
}
