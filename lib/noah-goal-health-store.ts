/**
 * 「体調ノート」の記録の置き場所（この端末のブラウザの保存先だけ。docs/noah/spec-goal-health.md の 3 章）。
 * 保存が止まっているブラウザ（読めない・書けない・いっぱい）では、この画面を開いている間だけ覚える
 * （書いた時に false を返し、画面がそれを伝える。一度書けなかった後は、覚えている方を読む）。
 * Noah のサーバーへも、ほかの所へも送らない。
 */
import { NOAH_GOAL_HEALTH_STORAGE_KEY } from './noah-goal-health.ts';

const listeners = new Set<() => void>();
let memory: string | null = null;
let onlyMemory = false;

export function noahGoalHealthSaved(): string | null {
  if (onlyMemory) return memory;
  try { return localStorage.getItem(NOAH_GOAL_HEALTH_STORAGE_KEY); } catch { onlyMemory = true; return memory; }
}

export function noahGoalHealthSubscribe(listener: () => void): () => void {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (!event.key || event.key === NOAH_GOAL_HEALTH_STORAGE_KEY) listener(); };
  window.addEventListener('storage', storage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', storage); };
}

/** 書いて、画面に知らせる。端末に保存できた時は true。null は全部消す。 */
export function noahGoalHealthWrite(text: string | null): boolean {
  memory = text;
  let stored = !onlyMemory;
  if (stored) {
    try {
      if (text === null) localStorage.removeItem(NOAH_GOAL_HEALTH_STORAGE_KEY);
      else localStorage.setItem(NOAH_GOAL_HEALTH_STORAGE_KEY, text);
    } catch { stored = false; onlyMemory = true; }
  }
  listeners.forEach((listener) => listener());
  return stored;
}
