import { noahConnectionSoundEnabled } from './noah-connection-sound';

type TapKind = 'tap' | 'select';
type Voice = { tone: OscillatorNode; envelope: GainNode };
let context: AudioContext | undefined, voice: Voice | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let generation = 0, lastAt = -Infinity;

function quiet() {
  const playing = voice; voice = undefined;
  if (!playing) return;
  playing.tone.onended = null;
  try { playing.tone.stop(); } catch { /* It may already have ended. */ }
  playing.tone.disconnect(); playing.envelope.disconnect();
}

/** Release audio when the page is hidden or the sound preference is disabled. */
export function disposeNoahTapSound(): void {
  generation++; clearTimeout(idle); idle = undefined; quiet();
  const previous = context; context = undefined;
  if (previous && previous.state !== 'closed') void previous.close().catch(() => undefined);
}

/** Only call from a real control activation; never from rendering or a network response. */
export function playNoahTapSound(kind: TapKind): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || document.hidden || !noahConnectionSoundEnabled()) return;
  const now = Date.now();
  if (now - lastAt < 65) return;
  lastAt = now;
  const ticket = ++generation;
  try {
    if (!context || context.state === 'closed') {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      context = new Audio({ latencyHint: 'interactive' });
    }
    const audio = context;
    clearTimeout(idle);
    const ring = () => {
      // An interrupted browser must not play an old tap when audio becomes available later.
      if (ticket !== generation || context !== audio || audio.state !== 'running' || document.hidden || !noahConnectionSoundEnabled() || Date.now() - now > 180) return;
      quiet();
      const tone = audio.createOscillator(), envelope = audio.createGain(), at = audio.currentTime;
      const playing = { tone, envelope }; voice = playing;
      tone.type = 'sine';
      tone.frequency.setValueAtTime(kind === 'select' ? 740 : 520, at);
      tone.frequency.exponentialRampToValueAtTime(kind === 'select' ? 320 : 210, at + .07);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(.12, at + .004);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + .085);
      tone.connect(envelope); envelope.connect(audio.destination);
      tone.onended = () => {
        tone.disconnect(); envelope.disconnect();
        if (voice === playing) voice = undefined;
      };
      tone.start(at); tone.stop(at + .095);
    };
    // Resume inside the activation handler; async completion is bounded and cancellable.
    if (audio.state === 'running') ring();
    else void audio.resume().then(ring).catch(() => { if (context === audio) disposeNoahTapSound(); });
    idle = setTimeout(() => {
      if (context === audio && audio.state === 'running') void audio.suspend().catch(() => undefined);
    }, 10_000);
  } catch { disposeNoahTapSound(); }
}
