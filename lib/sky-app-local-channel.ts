import { createSkyAppJob, executeSkyAppJob, confirmSkyAppJob, stopSkyAppJob } from './sky-app-foundation.ts';
import { parseSkyAppRequest } from './sky-app-contract.ts';
import type { WorkJob } from './workflow.ts';

export type LocalAppChannel = { id: string; senderOrigin: string; expiresAt: number; job: WorkJob; delivered: boolean };
export const CHANNEL_TTL_MS = 10 * 60_000;
export class LocalChannelError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
/** Development-only rendezvous, no account/session authority. Restart deliberately discards channels. */
export function createLocalChannelStore(maximum = 20) {
  const channels = new Map<string, LocalAppChannel>();
  const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/u.test(id);
  function prune(now: number) { for (const [id, value] of channels) if (value.expiresAt <= now) channels.delete(id); }
  function get(id: unknown, now = Date.now()) {
    prune(now);
    if (!validId(id) || !channels.has(id)) throw new LocalChannelError('受渡しの期限が切れたか、見つかりません。', 404);
    return structuredClone(channels.get(id)!);
  }
  return {
    get,
    create(id: unknown, senderOrigin: string, value: unknown, now = Date.now()) {
      prune(now);
      if (!validId(id)) throw new LocalChannelError('受渡しIDが不正です。', 400);
      const request = parseSkyAppRequest(value);
      if (request.appId !== 'planner') throw new LocalChannelError('この受渡しはPlanner用です。', 400);
      const current = channels.get(id);
      if (current) {
        if (current.senderOrigin !== senderOrigin || JSON.stringify(current.job.skyApp!.request) !== JSON.stringify(request)) throw new LocalChannelError('受渡しIDが使用されています。');
        return structuredClone(current);
      }
      if (channels.size >= maximum) throw new LocalChannelError('受渡し上限です。期限後に再試行してください。', 429);
      const channel = { id, senderOrigin, expiresAt: now + CHANNEL_TTL_MS, job: createSkyAppJob(request), delivered: false };
      channels.set(id, channel); return structuredClone(channel);
    },
    async command(id: unknown, action: string, revision: number, commandId: string, signal: AbortSignal) {
      const current = get(id);
      if (current.job.revision !== revision || current.delivered) throw new LocalChannelError('受渡しの版または状態が変わりました。');
      let next = current.job;
      if (action === 'run') next = await executeSkyAppJob(current.job, { signal, commandId });
      else if (action === 'confirm') next = confirmSkyAppJob(current.job, commandId, revision);
      else if (action === 'stop') next = stopSkyAppJob(current.job, commandId, revision);
      else if (action === 'deliver') {
        if (next.status !== 'completed' || !next.skyApp?.result) throw new LocalChannelError('本人確認済みの成果だけ返せます。');
      } else throw new LocalChannelError('操作を確認してください。', 400);
      if (get(id).job.revision !== revision) throw new LocalChannelError('停止または別の操作が先に反映されました。');
      const updated = { ...current, job: next, delivered: action === 'deliver' };
      channels.set(current.id, updated); return structuredClone(updated);
    },
  };
}
