import { NOAH_WAKE, noahWakeSignature } from '../../lib/noah-intake-wake';
// This worker knows only a fixed origin and the wake key. No HTTP entry point or Agent calls.
export default {
  async scheduled(_event: ScheduledController, env: { NOAH_ORIGIN: string; NOAH_PATROL_WAKE_KEY: string }) {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(env.NOAH_ORIGIN) || env.NOAH_PATROL_WAKE_KEY.length < NOAH_WAKE.minKeyChars) throw new Error('Invalid Noah wake configuration');
    const timestamp = String(Date.now());
    const response = await fetch(`https://${env.NOAH_ORIGIN}${NOAH_WAKE.path}`, {
      method: 'POST', redirect: 'manual', body: '{}', signal: AbortSignal.timeout(55000),
      headers: { 'Content-Type': 'application/json', 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(env.NOAH_PATROL_WAKE_KEY, timestamp) },
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Noah wake HTTP ${response.status}`);
  },
};
