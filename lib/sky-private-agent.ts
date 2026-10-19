import { parsePrivateZoomAgent, type PrivateZoomAgent } from './sky-zoom-recipe.ts';
import { matchesSkyAddHostFit, type SkyAddHostFit } from './sky-add-host-contract.ts';
import { parseSkyAppRequest, type SkyAppRequest } from './sky-app-contract.ts';

export const SKY_PRIVATE_AGENT_SCHEMA = 'sky.private-agent/1' as const;
export type SkyPrivateAgentFit = SkyAddHostFit & {
  surface: 'browser.preview' | 'macos.zoom.chat';
  inputSource: 'manual.text' | 'host.visible-chat';
  returnSlot: 'embedded.private' | 'host.chat-draft';
};
export type SkyPrivateAgentSpec = {
  schema: typeof SKY_PRIVATE_AGENT_SCHEMA;
  appId: 'notes' | 'zoom' | 'planner';
  recipe?: PrivateZoomAgent;
  fits: SkyPrivateAgentFit[];
  execution: 'bounded-text-adapter';
  declaredChargeMinor: 0;
  externalSend: false;
};
export type SkyPrivateAgentRecord = {
  id: string;
  ownerUserId: string;
  revision: number;
  digest: string;
  status: 'active' | 'revoked';
  spec: SkyPrivateAgentSpec;
  createdAt: number;
  updatedAt: number;
};
export type SkyPrivateAgentAdd = {
  id: string;
  ownerUserId: string;
  agentId: string;
  agentRevision: number;
  agentDigest: string;
  fit: SkyPrivateAgentFit;
  status: 'added' | 'removed';
  createdAt: number;
  updatedAt: number;
};
export type SkyPrivateAgentBinding = Pick<SkyPrivateAgentAdd,
  'id' | 'agentId' | 'agentRevision' | 'agentDigest' | 'fit'>;

const fits: readonly SkyPrivateAgentFit[] = [
  { surface: 'browser.preview', inputSource: 'manual.text', returnSlot: 'embedded.private' },
  { surface: 'macos.zoom.chat', inputSource: 'manual.text', returnSlot: 'embedded.private' },
  { surface: 'macos.zoom.chat', inputSource: 'host.visible-chat', returnSlot: 'embedded.private' },
  { surface: 'macos.zoom.chat', inputSource: 'manual.text', returnSlot: 'host.chat-draft' },
  { surface: 'macos.zoom.chat', inputSource: 'host.visible-chat', returnSlot: 'host.chat-draft' },
];

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))) throw new Error('Agent設定の項目を確認してください。');
  return value as Record<string, unknown>;
}
export function parseSkyPrivateAgentFit(value: unknown): SkyPrivateAgentFit {
  const fit = object(value, ['surface', 'inputSource', 'returnSlot']) as SkyPrivateAgentFit;
  const matched = fits.find((candidate) => matchesSkyAddHostFit({ agentId: 'private.zoom.notes', fits: [candidate] }, fit));
  if (!matched) throw new Error('この接続先・入力・返却先は利用できません。');
  return { ...matched };
}
export function parseSkyPrivateAgentSpec(value: unknown): SkyPrivateAgentSpec {
  const spec = object(value, ['schema', 'appId', 'recipe', 'fits', 'execution', 'declaredChargeMinor', 'externalSend']);
  if (spec.schema !== SKY_PRIVATE_AGENT_SCHEMA || spec.execution !== 'bounded-text-adapter' ||
      spec.declaredChargeMinor !== 0 || spec.externalSend !== false || !Array.isArray(spec.fits) ||
      spec.fits.length === 0 || spec.fits.length > fits.length) throw new Error('Agentの実行・料金・返却条件を確認してください。');
  const selected = spec.fits.map(parseSkyPrivateAgentFit);
  const appId = spec.appId ?? (spec.recipe === undefined ? undefined : 'zoom');
  if (appId !== 'notes' && appId !== 'zoom' && appId !== 'planner') throw new Error('Agentの接続先を確認してください。');
  if (appId === 'planner' && (spec.recipe !== undefined || selected.some((fit) => fit.surface !== 'browser.preview')))
    throw new Error('Planner Agentはブラウザーの手入力だけで使えます。');
  if (appId === 'notes' && selected.some((fit) => fit.surface !== 'browser.preview'))
    throw new Error('メモAgentはブラウザーの手入力だけで使えます。');
  if (appId !== 'planner' && spec.recipe === undefined) throw new Error('メモAgentの設定がありません。');
  if (new Set(selected.map((fit) => JSON.stringify(fit))).size !== selected.length)
    throw new Error('接続先の指定が重複しています。');
  return { schema: SKY_PRIVATE_AGENT_SCHEMA, appId,
    ...(appId !== 'planner' ? { recipe: parsePrivateZoomAgent(spec.recipe) } : {}), fits: selected,
    execution: 'bounded-text-adapter', declaredChargeMinor: 0, externalSend: false };
}
export async function skyPrivateAgentDigest(ownerUserId: string, agentId: string, revision: number, spec: SkyPrivateAgentSpec): Promise<string> {
  if (!ownerUserId || !agentId || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Agentの本人と版を確認してください。');
  const bytes = new TextEncoder().encode(JSON.stringify(['sky.private-agent.digest/1', ownerUserId, agentId, revision, parseSkyPrivateAgentSpec(spec)]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
/** App IDs are authority boundaries: a notes Add cannot run a Zoom or Planner request. */
export function skyPrivateAgentMatchesRequest(spec: SkyPrivateAgentSpec, request: SkyAppRequest): boolean {
  const agent = parseSkyPrivateAgentSpec(spec), input = parseSkyAppRequest(request);
  return agent.appId === input.appId &&
    (input.appId === 'planner' || JSON.stringify(agent.recipe) === JSON.stringify(input.recipe));
}
export function parseSkyPrivateAgentBinding(value: unknown): SkyPrivateAgentBinding {
  const binding = object(value, ['id', 'agentId', 'agentRevision', 'agentDigest', 'fit']);
  for (const key of ['id', 'agentId'] as const)
    if (typeof binding[key] !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(binding[key])) throw new Error('Agent追加IDを確認してください。');
  if (!Number.isSafeInteger(binding.agentRevision) || (binding.agentRevision as number) < 1 ||
      typeof binding.agentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(binding.agentDigest)) throw new Error('Agentの版を確認してください。');
  return { id: binding.id as string, agentId: binding.agentId as string, agentRevision: binding.agentRevision as number,
    agentDigest: binding.agentDigest as string, fit: parseSkyPrivateAgentFit(binding.fit) };
}
export type SkyPrivateAgentAddDecision =
  | 'candidate-only' | 'owner-mismatch' | 'agent-unavailable' | 'add-removed'
  | 'agent-version-changed' | 'host-fit-changed';

/** Add is a versioned discovery binding, never an OS grant or execution approval. */
export function evaluateSkyPrivateAgentAdd(ownerUserId: string, agent: SkyPrivateAgentRecord | null,
  add: SkyPrivateAgentAdd | null, requestedFit: SkyPrivateAgentFit): SkyPrivateAgentAddDecision {
  if (!agent || agent.status !== 'active') return 'agent-unavailable';
  if (agent.ownerUserId !== ownerUserId || add?.ownerUserId !== ownerUserId) return 'owner-mismatch';
  if (!add || add.status !== 'added' || add.agentId !== agent.id) return 'add-removed';
  if (add.agentRevision !== agent.revision || add.agentDigest !== agent.digest) return 'agent-version-changed';
  if (!matchesSkyAddHostFit({ agentId: agent.id, fits: agent.spec.fits }, requestedFit) ||
      !matchesSkyAddHostFit({ agentId: agent.id, fits: [add.fit] }, requestedFit)) return 'host-fit-changed';
  return 'candidate-only';
}
