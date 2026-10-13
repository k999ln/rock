import type { Automation } from './catalog';

export const SKY_PHOENIX_VERSION = 'sky-phoenix-v1';
export const SKY_PHOENIX_STORAGE_KEY = 'rockstar.sky.phoenix.v1';
export const SKY_PHOENIX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SKY_PHOENIX_MAX_EVENTS = 800;

export type SkyPhoenixEventType =
  | 'impression'
  | 'detail'
  | 'route'
  | 'launch'
  | 'save'
  | 'unsave'
  | 'connect'
  | 'complete'
  | 'fail';

export type SkyPhoenixEvent = {
  id: string;
  sessionId: string;
  toolId: string;
  type: SkyPhoenixEventType;
  at: number;
  dwellMs?: number;
  position?: number;
};

export type SkyPhoenixState = {
  version: typeof SKY_PHOENIX_VERSION;
  enabled: boolean;
  events: SkyPhoenixEvent[];
};

export type SkyPhoenixPrediction = {
  detail: number;
  launch: number;
  save: number;
  connect: number;
  skip: number;
  score: number;
  reason: 'frequent-tool' | 'preferred-category' | 'recent-use' | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type ToolShape = Pick<Automation, 'id' | 'category'>;

const eventTypes = new Set<SkyPhoenixEventType>([
  'impression',
  'detail',
  'route',
  'launch',
  'save',
  'unsave',
  'connect',
  'complete',
  'fail',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HALF_LIFE_MS = 10 * 24 * 60 * 60 * 1000;

export const emptySkyPhoenixState = (): SkyPhoenixState => ({
  version: SKY_PHOENIX_VERSION,
  enabled: false,
  events: [],
});

function finiteInt(value: unknown, min: number, max: number) {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function isSkyPhoenixEvent(
  value: unknown,
  now = Date.now(),
): value is SkyPhoenixEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (
    Object.keys(event).some(
      (key) =>
        ![
          'id',
          'sessionId',
          'toolId',
          'type',
          'at',
          'dwellMs',
          'position',
        ].includes(key),
    ) ||
    typeof event.id !== 'string' ||
    !uuidPattern.test(event.id) ||
    typeof event.sessionId !== 'string' ||
    !uuidPattern.test(event.sessionId) ||
    typeof event.toolId !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(event.toolId) ||
    typeof event.type !== 'string' ||
    !eventTypes.has(event.type as SkyPhoenixEventType) ||
    !finiteInt(event.at, now - SKY_PHOENIX_RETENTION_MS, now + 30_000)
  )
    return false;
  const dwellMs = event.dwellMs;
  if (
    dwellMs !== undefined &&
    (!finiteInt(dwellMs, 0, 30_000) ||
      ![1_000, 10_000, 30_000].includes(dwellMs as number))
  )
    return false;
  if (event.position !== undefined && !finiteInt(event.position, 0, 200))
    return false;
  return event.type === 'impression' || event.dwellMs === undefined;
}

function sanitizeEvents(value: unknown, now: number) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, SkyPhoenixEvent>();
  for (const event of value) {
    if (isSkyPhoenixEvent(event, now)) unique.set(event.id, event);
  }
  return [...unique.values()]
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .slice(-SKY_PHOENIX_MAX_EVENTS);
}

export function readSkyPhoenixState(
  storage: StorageLike,
  now = Date.now(),
): SkyPhoenixState {
  try {
    const raw = storage.getItem(SKY_PHOENIX_STORAGE_KEY);
    if (!raw) return emptySkyPhoenixState();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return emptySkyPhoenixState();
    const state = value as Record<string, unknown>;
    if (state.version !== SKY_PHOENIX_VERSION) return emptySkyPhoenixState();
    return {
      version: SKY_PHOENIX_VERSION,
      enabled: state.enabled === true,
      events: sanitizeEvents(state.events, now),
    };
  } catch {
    return emptySkyPhoenixState();
  }
}

export function writeSkyPhoenixState(
  storage: StorageLike,
  state: SkyPhoenixState,
  now = Date.now(),
) {
  const next: SkyPhoenixState = {
    version: SKY_PHOENIX_VERSION,
    enabled: state.enabled,
    events: sanitizeEvents(state.events, now),
  };
  try {
    storage.setItem(SKY_PHOENIX_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function appendSkyPhoenixEvent(
  storage: StorageLike,
  event: SkyPhoenixEvent,
  now = Date.now(),
) {
  const state = readSkyPhoenixState(storage, now);
  if (!state.enabled || !isSkyPhoenixEvent(event, now)) return state;
  const next = {
    ...state,
    events: [...state.events.filter((item) => item.id !== event.id), event],
  };
  writeSkyPhoenixState(storage, next, now);
  return readSkyPhoenixState(storage, now);
}

export function mergeSkyPhoenixEvents(
  storage: StorageLike,
  events: readonly SkyPhoenixEvent[],
  enabled: boolean,
  now = Date.now(),
) {
  const current = readSkyPhoenixState(storage, now);
  const next: SkyPhoenixState = {
    version: SKY_PHOENIX_VERSION,
    enabled,
    events: [...current.events, ...events],
  };
  writeSkyPhoenixState(storage, next, now);
  return readSkyPhoenixState(storage, now);
}

export function setSkyPhoenixEnabled(
  storage: StorageLike,
  enabled: boolean,
  now = Date.now(),
) {
  const current = readSkyPhoenixState(storage, now);
  const next = { ...current, enabled };
  writeSkyPhoenixState(storage, next, now);
  return next;
}

export function clearSkyPhoenixHistory(storage: StorageLike) {
  const current = readSkyPhoenixState(storage);
  const next: SkyPhoenixState = { ...current, events: [] };
  try {
    storage.setItem(SKY_PHOENIX_STORAGE_KEY, JSON.stringify(next));
  } catch {
    try {
      storage.removeItem(SKY_PHOENIX_STORAGE_KEY);
    } catch {
      // The caller keeps an in-memory cold-start state when storage is blocked.
    }
  }
  return next;
}

type EventStats = {
  impressions: number;
  dwell: number;
  detail: number;
  route: number;
  launch: number;
  save: number;
  unsave: number;
  connect: number;
  complete: number;
  fail: number;
  lastPositiveAt: number;
};

const blankStats = (): EventStats => ({
  impressions: 0,
  dwell: 0,
  detail: 0,
  route: 0,
  launch: 0,
  save: 0,
  unsave: 0,
  connect: 0,
  complete: 0,
  fail: 0,
  lastPositiveAt: 0,
});

function addEvent(stats: EventStats, event: SkyPhoenixEvent, now: number) {
  const age = Math.max(0, now - event.at);
  const weight = Math.exp((-Math.LN2 * age) / HALF_LIFE_MS);
  if (event.type === 'impression') {
    stats.impressions += weight;
    stats.dwell +=
      weight * Math.min(3, Math.log1p(Math.max(0, event.dwellMs ?? 0) / 1_000));
    return;
  }
  stats[event.type] += weight;
  if (event.type !== 'unsave')
    stats.lastPositiveAt = Math.max(stats.lastPositiveAt, event.at);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function predictionFor(
  tool: ToolShape,
  direct: EventStats,
  category: EventStats,
  now: number,
): SkyPhoenixPrediction {
  if (
    direct.impressions === 0 &&
    category.impressions === 0 &&
    direct.lastPositiveAt === 0 &&
    category.lastPositiveAt === 0 &&
    direct.unsave === 0 &&
    category.unsave === 0
  )
    return {
      detail: 0,
      launch: 0,
      save: 0,
      connect: 0,
      skip: 0,
      score: 0,
      reason: null,
    };
  const directPositive =
    direct.detail * 0.35 +
    direct.route * 0.8 +
    direct.launch * 1.15 +
    direct.save * 1.4 +
    direct.connect * 1.65 +
    direct.complete * 2.1 -
    direct.fail * 0.9;
  const categoryPositive =
    category.detail * 0.12 +
    category.route * 0.24 +
    category.launch * 0.3 +
    category.save * 0.38 +
    category.connect * 0.45 +
    category.complete * 0.55 -
    category.fail * 0.2;
  const directAffinity =
    (directPositive + direct.dwell * 0.09 - direct.unsave * 1.2) /
    (1.6 + direct.impressions);
  const categoryAffinity =
    (categoryPositive + category.dwell * 0.025 - category.unsave * 0.35) /
    (3 + category.impressions * 0.35);
  const affinity = clamp(directAffinity + categoryAffinity, -1, 2.5);
  const latest = Math.max(direct.lastPositiveAt, category.lastPositiveAt);
  const recency = latest
    ? Math.exp(-Math.max(0, now - latest) / (14 * 24 * 60 * 60 * 1_000))
    : 0;
  const fatigue = clamp(
    (direct.impressions - directPositive * 1.4) / (4 + direct.impressions),
  );
  const detail = clamp(0.04 + affinity * 0.16 + recency * 0.05);
  const launch = clamp(
    0.02 + affinity * 0.13 + direct.launch * 0.08 + recency * 0.04,
  );
  const save = clamp(0.01 + affinity * 0.09 + direct.save * 0.12);
  const connect = clamp(0.008 + affinity * 0.08 + direct.connect * 0.13);
  const skip = clamp(0.08 + fatigue * 0.58 + direct.unsave * 0.16);
  const score = clamp(
    detail * 7 +
      launch * 20 +
      save * 24 +
      connect * 28 -
      skip * 12 +
      recency * 5,
    -12,
    42,
  );
  const reason =
    directPositive >= 0.8
      ? 'frequent-tool'
      : categoryPositive >= 0.8
        ? 'preferred-category'
        : latest
          ? 'recent-use'
          : null;
  void tool;
  return { detail, launch, save, connect, skip, score, reason };
}

export function buildSkyPhoenixPredictions(
  tools: readonly ToolShape[],
  events: readonly SkyPhoenixEvent[],
  now = Date.now(),
) {
  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  const direct = new Map<string, EventStats>();
  const categories = new Map<string, EventStats>();
  for (const event of sanitizeEvents(events, now)) {
    const tool = toolById.get(event.toolId);
    if (!tool) continue;
    const toolStats = direct.get(tool.id) ?? blankStats();
    const categoryStats = categories.get(tool.category) ?? blankStats();
    addEvent(toolStats, event, now);
    addEvent(categoryStats, event, now);
    direct.set(tool.id, toolStats);
    categories.set(tool.category, categoryStats);
  }
  return new Map(
    tools.map((tool) => [
      tool.id,
      predictionFor(
        tool,
        direct.get(tool.id) ?? blankStats(),
        categories.get(tool.category) ?? blankStats(),
        now,
      ),
    ]),
  );
}
