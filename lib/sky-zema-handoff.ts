import type { Job } from './operations';

export const SKY_ZEMA_HANDOFF_KEY = 'rockstaros.sky-zema-handoff.v1';
export const SKY_ZEMA_JOB_EVENT = 'rockstaros:sky-zema-job';
export const SKY_ZEMA_HANDOFF_TTL_MS = 10 * 60 * 1000;

const MAX_REQUEST_LENGTH = 2000;
const TOOL_ID = /^[a-z0-9][a-z0-9:.-]{0,119}$/;

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SkyZemaHandoff = {
  version: 1;
  id: string;
  source: 'sky';
  toolId: string;
  request: string;
  createdAt: number;
};

function validHandoff(value: unknown): value is SkyZemaHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const handoff = value as Partial<SkyZemaHandoff>;
  return (
    handoff.version === 1 &&
    handoff.source === 'sky' &&
    typeof handoff.id === 'string' &&
    /^[0-9a-f-]{36}$/.test(handoff.id) &&
    typeof handoff.toolId === 'string' &&
    TOOL_ID.test(handoff.toolId) &&
    typeof handoff.request === 'string' &&
    handoff.request.length <= MAX_REQUEST_LENGTH &&
    typeof handoff.createdAt === 'number' &&
    Number.isFinite(handoff.createdAt)
  );
}

export function queueSkyZemaHandoff(
  toolId: string,
  request: string,
  storage: HandoffStorage = window.sessionStorage,
  now = Date.now(),
): SkyZemaHandoff {
  if (!TOOL_ID.test(toolId))
    throw new Error('引き継ぐToolを確認してください。');
  const handoff: SkyZemaHandoff = {
    version: 1,
    id: crypto.randomUUID(),
    source: 'sky',
    toolId,
    request: request.trim().slice(0, MAX_REQUEST_LENGTH),
    createdAt: now,
  };
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
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    storage.removeItem(SKY_ZEMA_HANDOFF_KEY);
    return null;
  }
  if (
    !validHandoff(value) ||
    value.createdAt > now + 30_000 ||
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
