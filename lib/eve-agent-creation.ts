import { parseSkyAgentSettings, type SkyAgentSettings, type SkyLibraryAgent } from './sky-agent-library.ts';
import { readOwnerScope } from './owner-intent.ts';

/** Settings are sent only to the owner API; browser pending storage contains only a digest. */
export type EveAgentCreation = { ownerScope: string; id: string; settings: SkyAgentSettings };
export type EveAgentPending = { schema: 1; ownerScope: string; id: string; settingsSha256: string };
export type EveAgentCreationResult =
  | { state: 'saved'; agent: SkyLibraryAgent }
  | { state: 'rejected'; error: string }
  | { state: 'unknown'; error: string };
type Fetcher = typeof fetch;
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const pendingPrefix = 'rockstar.eve.agent-create.v1:';
const unknownResult = (): EveAgentCreationResult => ({ state: 'unknown', error: '保存結果をまだ確認できません。同じ担当を照合してください。' });

function key(scope: string) {
  if (!readOwnerScope(scope)) throw new Error('本人を確認できません。');
  return pendingPrefix + scope;
}
function validPending(value: unknown, scope: string): value is EveAgentPending {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 4 && v.schema === 1 && v.ownerScope === scope &&
    typeof v.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.id) &&
    typeof v.settingsSha256 === 'string' && /^[a-f0-9]{64}$/.test(v.settingsSha256);
}
function canonical(settings: SkyAgentSettings) {
  const value = parseSkyAgentSettings(settings);
  // Preserve the original five-field digest byte-for-byte for old pending records.
  // Optional declarations are included only when present and are never grants.
  return JSON.stringify({ name: value.name, instructions: value.instructions, provider: value.provider, model: value.model, enabled: value.enabled,
    ...(value.requirements ? { requirements: value.requirements } : {}),
    ...(value.attachment ? { attachment: value.attachment } : {}),
    ...(value.origin ? { origin:value.origin } : {}) });
}
async function digest(settings: SkyAgentSettings) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(settings)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function prepareEveAgentPending(request: EveAgentCreation): Promise<EveAgentPending> {
  const pending: EveAgentPending = { schema: 1, ownerScope: request.ownerScope, id: request.id, settingsSha256: await digest(request.settings) };
  if (!validPending(pending, request.ownerScope) || !readOwnerScope(request.ownerScope)) throw new Error('担当の保存内容を確認してください。');
  return pending;
}
/** Invalid or inaccessible storage fails closed. Other owners' keys are not read. */
export function readEveAgentPending(storage: PendingStorage, scope: string): EveAgentPending | null {
  const raw = storage.getItem(key(scope));
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('保存途中の担当を確認できません。'); }
  if (!validPending(value, scope)) throw new Error('保存途中の担当を確認できません。');
  return value;
}
export function reserveEveAgentPending(storage: PendingStorage, pending: EveAgentPending) {
  if (!validPending(pending, pending.ownerScope) || readEveAgentPending(storage, pending.ownerScope)) throw new Error('保存途中の担当を先に確認してください。');
  storage.setItem(key(pending.ownerScope), JSON.stringify(pending));
  if (JSON.stringify(readEveAgentPending(storage, pending.ownerScope)) !== JSON.stringify(pending)) throw new Error('保存前の記録を確認できません。');
}
function clearPending(storage: PendingStorage, pending: EveAgentPending) {
  if (JSON.stringify(readEveAgentPending(storage, pending.ownerScope)) !== JSON.stringify(pending)) throw new Error('保存記録が変わりました。');
  storage.removeItem(key(pending.ownerScope));
  if (readEveAgentPending(storage, pending.ownerScope) !== null) throw new Error('保存記録を確認できません。');
}
async function matches(candidate: SkyLibraryAgent | undefined, pending: EveAgentPending): Promise<boolean> {
  if (!candidate || candidate.id !== pending.id || candidate.revision !== 1 || candidate.source !== 'personal' || candidate.sourceTool !== null) return false;
  try { return await digest({ name: candidate.name, instructions: candidate.instructions, provider: candidate.provider, model: candidate.model, enabled: candidate.enabled,
    ...(Object.hasOwn(candidate, 'requirements') ? { requirements: candidate.requirements } : {}),
    ...(Object.hasOwn(candidate, 'attachment') ? { attachment: candidate.attachment } : {}),
    ...(Object.hasOwn(candidate, 'origin') ? { origin:candidate.origin } : {}) }) === pending.settingsSha256; }
  catch { return false; }
}
/** Reconcile only with an authenticated read of the exact owner, ID and settings. */
export async function reconcileEveAgentCreation(fetcher: Fetcher, pending: EveAgentPending, storage: PendingStorage): Promise<EveAgentCreationResult> {
  try {
    const response = await fetcher(`/api/sky/agents?id=${encodeURIComponent(pending.id)}`, { cache: 'no-store' });
    if (!response.ok) return unknownResult();
    const data = await response.json() as { ownerScope?: string; agent?: SkyLibraryAgent };
    if (data.ownerScope === pending.ownerScope && await matches(data.agent, pending)) {
      clearPending(storage, pending);
      return { state: 'saved', agent: data.agent! };
    }
  } catch { /* Failed read or storage cleanup does not prove resolution. */ }
  return unknownResult();
}
/** Persist the owner-bound digest before sending; 408 and 409 require readback; other explicit 4xx is rejected. */
export async function createEveAgent(fetcher: Fetcher, request: EveAgentCreation, pending: EveAgentPending, storage: PendingStorage, beforeSend?: () => void): Promise<EveAgentCreationResult> {
  const settings = parseSkyAgentSettings(request.settings);
  if (JSON.stringify(await prepareEveAgentPending(request)) !== JSON.stringify(pending)) throw new Error('担当の保存内容を確認してください。');
  // The final asynchronous digest has completed. Recheck the live source before
  // reserving a journal entry or sending an owner-bound write.
  beforeSend?.();
  reserveEveAgentPending(storage, pending);
  let response: Response;
  try {
    response = await fetcher('/api/sky/agents', { method: 'PUT', headers: {
      'Content-Type': 'application/json', 'X-Rock-Owner-Scope': request.ownerScope,
    }, body: JSON.stringify({ id: request.id, revision: 0, settings, create: true }) });
  } catch { return reconcileEveAgentCreation(fetcher, pending, storage); }
  // A timeout or duplicate conflict can follow a write committed upstream,
  // including a transport replay. Resolve by the original owner and ID.
  if (response.status === 409) {
    try {
      const failure = await response.clone().json() as {code?:unknown;error?:unknown};
      if (failure.code === 'EVE_SOURCE_CHANGED') {
        clearPending(storage,pending);
        return {state:'rejected',error:typeof failure.error==='string'?failure.error:'出典が変わりました。Skyから選び直してください。'};
      }
    } catch { /* An unreadable or uncertain conflict still requires exact readback. */ }
  }
  if (response.status === 408 || response.status === 409 || response.status >= 500)
    return reconcileEveAgentCreation(fetcher, pending, storage);
  if (!response.ok) {
    let error = '保存できませんでした。入力を確認してください。';
    try { const data = await response.json() as { error?: unknown }; if (typeof data.error === 'string') error = data.error; } catch { /* retain rejection */ }
    try { clearPending(storage, pending); } catch { return unknownResult(); }
    return { state: 'rejected', error };
  }
  try {
    const data = await response.json() as { agent?: SkyLibraryAgent };
    if (await matches(data.agent, pending)) { clearPending(storage, pending); return { state: 'saved', agent: data.agent! }; }
  } catch { /* Response body or cleanup may have failed after commit. */ }
  return reconcileEveAgentCreation(fetcher, pending, storage);
}
