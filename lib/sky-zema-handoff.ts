import type { Job } from './operations';
import { createSkyZemaEnvelope, isSkyToolId, normalizeSkyZemaHandoff, skyZemaLimits } from '../public-release/rockstaros/packages/sky-zema-core/src/handoff.js';

export const SKY_ZEMA_HANDOFF_KEY = 'rockstaros.sky-zema-handoff.v1';
export const SKY_ZEMA_JOB_EVENT = 'rockstaros:sky-zema-job';
export const SKY_ZEMA_HANDOFF_TTL_MS = skyZemaLimits.privateSessionTtlMs;

const MAX_REQUEST_LENGTH = skyZemaLimits.request;

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SkyZemaHandoff = ReturnType<typeof createSkyZemaEnvelope>;

export function queueSkyZemaHandoff(
  toolId: string,
  request: string,
  storage: HandoffStorage = window.sessionStorage,
  now = Date.now(),
): SkyZemaHandoff {
  if (!isSkyToolId(toolId))
    throw new Error('引き継ぐToolを確認してください。');
  const handoff: SkyZemaHandoff = createSkyZemaEnvelope({
    id: crypto.randomUUID(),
    toolId,
    request: request.trim().slice(0, MAX_REQUEST_LENGTH),
    createdAt: now,
  });
  storage.setItem(SKY_ZEMA_HANDOFF_KEY, JSON.stringify(handoff));
  return handoff;
}

export function consumeSkyZemaHandoff(
  expectedToolId: string,
  storage: HandoffStorage = window.sessionStorage,
  now = Date.now(),
): SkyZemaHandoff | null {
  const raw = storage.getItem(SKY_ZEMA_HANDOFF_KEY);
  if (!raw) return null;
  let value: SkyZemaHandoff;
  try {
    value = normalizeSkyZemaHandoff(JSON.parse(raw));
  } catch {
    storage.removeItem(SKY_ZEMA_HANDOFF_KEY);
    return null;
  }
  if (
    !/^[0-9a-f-]{36}$/.test(value.id) ||
    value.createdAt > now + skyZemaLimits.futureToleranceMs ||
    now - value.createdAt > SKY_ZEMA_HANDOFF_TTL_MS
  ) {
    storage.removeItem(SKY_ZEMA_HANDOFF_KEY);
    return null;
  }
  if (value.toolId !== expectedToolId) return null;
  storage.removeItem(SKY_ZEMA_HANDOFF_KEY);
  return value;
}

export function announceSkyZemaJob(job: Job) {
  window.dispatchEvent(
    new CustomEvent<Job>(SKY_ZEMA_JOB_EVENT, { detail: job }),
  );
}
