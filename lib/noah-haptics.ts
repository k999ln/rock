export type NoahHaptic = 'tap' | 'select' | 'success';
export const NOAH_HAPTICS_KEY = 'noah-haptics-v1';
const CHANGE = 'noah-haptics-change';
const patterns: Record<NoahHaptic, number | number[]> = { tap: 16, select: 24, success: [12, 45, 12] };
let memoryPreference: boolean | undefined;
let lastAt = -Infinity;

export function noahHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  if (memoryPreference !== undefined) return memoryPreference;
  try { return window.localStorage.getItem(NOAH_HAPTICS_KEY) !== 'off'; } catch { return true; }
}

export function noahHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function setNoahHaptics(enabled: boolean): void {
  memoryPreference = enabled;
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(NOAH_HAPTICS_KEY, enabled ? 'on' : 'off'); } catch { /* Session preference still works when storage is unavailable. */ }
  if (!enabled && noahHapticsSupported()) { try { navigator.vibrate(0); } catch { /* Unsupported device policy. */ } }
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeNoahHaptics(listener: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === NOAH_HAPTICS_KEY || event.key === null) { memoryPreference = undefined; listener(); }
  };
  window.addEventListener(CHANGE, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(CHANGE, listener); window.removeEventListener('storage', storage); };
}

/** Invoke success only after a confirmed save/registration response, never on submit or polling. */
export function noahHaptic(kind: NoahHaptic): boolean {
  if (!noahHapticsSupported() || !noahHapticsEnabled() || typeof document === 'undefined' || document.hidden) return false;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  const now = Date.now();
  if (kind !== 'success' && now - lastAt < 70) return false;
  try {
    const played = navigator.vibrate(patterns[kind]);
    if (played) lastAt = now;
    return played;
  } catch { return false; }
}

/** Only real activation of enabled controls, not scrolling, typing, or synthetic clicks. */
export function noahControlFeedback(target: EventTarget | null, trusted: boolean): NoahHaptic | null {
  if (!trusted || typeof Element === 'undefined' || !(target instanceof Element)) return null;
  const control = target.closest('button, a[href], summary, input[type="checkbox"], input[type="radio"], [role="button"], [role="switch"], [role="tab"]');
  if (!control || control.closest('[inert], [aria-disabled="true"], [data-noah-haptic="off"]') || control.matches(':disabled')) return null;
  return control.matches('input, [role="switch"], [role="tab"], [aria-pressed], [aria-expanded], [popovertarget]') ? 'select' : 'tap';
}
