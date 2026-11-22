const KEY = 'noah-connection-sound-v1';
const CHANGE = 'noah-connection-sound-change';
let preference: boolean | undefined;

export function noahConnectionSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  if (preference !== undefined) return preference;
  try { return window.localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setNoahConnectionSound(enabled: boolean): void {
  preference = enabled;
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* Keep the session preference. */ }
  window.dispatchEvent(new Event(CHANGE));
}
export function subscribeNoahConnectionSound(listener: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) { preference = undefined; listener(); }
  };
  window.addEventListener(CHANGE, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(CHANGE, listener); window.removeEventListener('storage', storage); };
}

export type NoahConnectionSound = { play: () => boolean; dispose: () => void };
/** Unlock silently in the tap handler; only a confirmed connection may play it. */
export function prepareNoahConnectionSound(): NoahConnectionSound {
  let context: AudioContext | undefined, used = false;
  const dispose = () => {
    used = true;
    if (context && context.state !== 'closed') { void context.close().catch(() => undefined); }
  };
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !document.hidden && noahConnectionSoundEnabled()) {
    try {
      if (window.AudioContext) {
        context = new window.AudioContext();
        void context.resume().catch(dispose);
      }
    } catch { dispose(); }
  }
  return { dispose, play: () => {
    if (used) return false;
    if (!context || context.state !== 'running' || document.hidden || !noahConnectionSoundEnabled()) { dispose(); return false; }
    used = true;
    try {
      const tone = context.createOscillator(), envelope = context.createGain(), at = context.currentTime;
      tone.type = 'sine';
      tone.frequency.setValueAtTime(660, at);
      tone.frequency.exponentialRampToValueAtTime(240, at + .12);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(.12, at + .006);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + .16);
      tone.connect(envelope); envelope.connect(context.destination);
      tone.onended = () => { tone.disconnect(); envelope.disconnect(); dispose(); };
      tone.start(at); tone.stop(at + .18);
      return true;
    } catch { dispose(); return false; }
  } };
}
