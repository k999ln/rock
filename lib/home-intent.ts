import { parseEveSourcePin, type EveSourcePin } from './eve-source-context.ts';
import { readOwnerScope } from './owner-intent.ts';
// One-shot, tab-local handoff. Request text never enters a URL or localStorage.
export const HOME_INTENT_KEY = 'rockstaros.home.intent.v1';
export const HOME_INTENT_MAX_LENGTH = 2000;
export const HOME_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

/** Tab/module-local ordering only; this ticket is not identity or authority. */
export type HomeIntentSelection = Readonly<{ isCurrent: () => boolean }>;
let latestSelection: HomeIntentSelection | null = null;
export function beginHomeIntentSelection(storage: Pick<Storage, 'getItem' | 'removeItem'>): HomeIntentSelection {
  const selection: HomeIntentSelection = Object.freeze({ isCurrent: () => latestSelection === selection });
  // Even a denied clear or failed lookup supersedes older in-flight choices.
  latestSelection = selection;
  storage.removeItem(HOME_INTENT_KEY);
  if (storage.getItem(HOME_INTENT_KEY) !== null) throw new Error('前の引継ぎを取り消せません。保存領域を確認してください。');
  return selection;
}
export function writeHomeIntent(
  storage: Pick<Storage, 'setItem'>,
  text: string,
  now = Date.now(),
  context?: { ownerScope:string; source:EveSourcePin },
  selection?: HomeIntentSelection,
) {
  if (selection) {
    if (latestSelection !== selection) throw new Error('新しい依頼が選ばれました。出典を選び直してください。');
  } else {
    // Legacy CTAs share this one slot and also supersede pending source choices.
    latestSelection = null;
  }
  const intent = text.trim();
  if (!intent || intent.length > HOME_INTENT_MAX_LENGTH)
    throw new Error('依頼は1〜2000文字で入力してください。');
  storage.setItem(HOME_INTENT_KEY, JSON.stringify({ text: intent, at: now, ...(context ? {context:{ownerScope:readOwnerScope(context.ownerScope) ?? failOwner(),source:parseEveSourcePin(context.source)}} : {}) }));
}
function failOwner():never { throw new Error('本人を確認してください。'); }
export type HomeIntent = {text:string;at:number;context?:{ownerScope:string;source:EveSourcePin}};
export function takeHomeIntentRecord(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  now = Date.now(),
): HomeIntent | null {
  const raw = storage.getItem(HOME_INTENT_KEY);
  storage.removeItem(HOME_INTENT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { text?: unknown; at?: unknown; context?:unknown };
    if (
      typeof value.text !== 'string' ||
      !value.text.trim() ||
      value.text.length > HOME_INTENT_MAX_LENGTH ||
      typeof value.at !== 'number' ||
      !Number.isFinite(value.at) ||
      value.at > now ||
      now - value.at > HOME_INTENT_MAX_AGE_MS
    )
      return null;
    let context:HomeIntent['context'];
    if (Object.hasOwn(value,'context')) {
      const c=value.context as Record<string,unknown>;
      if (!c || typeof c!=='object' || Array.isArray(c) || Object.keys(c).length!==2 || !readOwnerScope(c.ownerScope)) return null;
      context={ownerScope:readOwnerScope(c.ownerScope)!,source:parseEveSourcePin(c.source)};
    }
    return {text:value.text.trim(),at:value.at,...(context?{context}:{})};
  } catch {
    return null;
  }
}

/** Compatibility reader for callers that only use unbound text. */
export function takeHomeIntent(storage:Pick<Storage,'getItem'|'removeItem'>,now=Date.now()):string {
  const record=takeHomeIntentRecord(storage,now);
  return record?.context ? '' : record?.text ?? '';
}
