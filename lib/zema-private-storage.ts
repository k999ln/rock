export const ZEMA_CHAT_SESSION_KEY = 'rockstaros.zema-chat-sessions.v1';
export const SKY_ZEMA_HANDOFF_KEY = 'rockstaros.sky-zema-handoff.v1';
type PrivateStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let invalidated = false;
const listeners = new Set<() => void>();
export function subscribeZemaPrivateStorage(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const notify = () => { for (const listener of listeners) listener(); };
// An opaque flag only: no account ID or private text. Unlike sessionStorage,
// the browsing-context name remains accessible when storage access is denied.
// Preserve the previous name and restore it only after both keys read as absent.
const quarantinePrefix = '__rockstaros_zema_cleanup_v1__:';

export function zemaPrivateStorageBlocked(): boolean {
  if (invalidated) return true;
  if (typeof window === 'undefined') return false;
  try { return window.name.startsWith(quarantinePrefix); } catch { return true; }
}

export function openZemaPrivateStorage(storage?: PrivateStorage): PrivateStorage | null {
  if (zemaPrivateStorageBlocked()) return null;
  try { return storage ?? window.sessionStorage; } catch { return null; }
}

export function clearZemaPrivateSession(storage?: Pick<Storage, 'getItem' | 'removeItem'>): boolean {
  invalidated = true;
  notify();
  if (typeof window !== 'undefined') {
    try {
      if (!window.name.startsWith(quarantinePrefix)) window.name = quarantinePrefix + window.name;
    } catch { /* The in-memory barrier still prevents restoration in this document. */ }
  }
  let target: Pick<Storage, 'getItem' | 'removeItem'>;
  try { target = storage ?? window.sessionStorage; } catch { return false; }
  let cleared = true;
  for (const key of [ZEMA_CHAT_SESSION_KEY, SKY_ZEMA_HANDOFF_KEY]) {
    try { target.removeItem(key); } catch { cleared = false; }
    try { if (target.getItem(key) !== null) cleared = false; } catch { cleared = false; }
  }
  if (!cleared) return false;
  if (typeof window !== 'undefined') {
    try {
      if (window.name.startsWith(quarantinePrefix)) window.name = window.name.slice(quarantinePrefix.length);
      if (window.name.startsWith(quarantinePrefix)) return false;
    } catch { return false; }
  }
  invalidated = false;
  notify();
  return true;
}
