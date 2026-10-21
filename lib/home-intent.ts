// One-shot, tab-local handoff. Request text never enters a URL or localStorage.
export const HOME_INTENT_KEY = 'rockstaros.home.intent.v1';
export const HOME_INTENT_MAX_LENGTH = 2000;
const MAX_AGE_MS = 10 * 60 * 1000;
export function writeHomeIntent(
  storage: Pick<Storage, 'setItem'>,
  text: string,
  now = Date.now(),
) {
  const intent = text.trim();
  if (!intent || intent.length > HOME_INTENT_MAX_LENGTH)
    throw new Error('依頼は1〜2000文字で入力してください。');
  storage.setItem(HOME_INTENT_KEY, JSON.stringify({ text: intent, at: now }));
}
export function takeHomeIntent(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  now = Date.now(),
): string {
  const raw = storage.getItem(HOME_INTENT_KEY);
  storage.removeItem(HOME_INTENT_KEY);
  if (!raw) return '';
  try {
    const value = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (
      typeof value.text !== 'string' ||
      !value.text.trim() ||
      value.text.length > HOME_INTENT_MAX_LENGTH ||
      typeof value.at !== 'number' ||
      !Number.isFinite(value.at) ||
      value.at > now ||
      now - value.at > MAX_AGE_MS
    )
      return '';
    return value.text.trim();
  } catch {
    return '';
  }
}
