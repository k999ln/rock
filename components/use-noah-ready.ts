'use client';
import { useEffect, useState } from 'react';

const KEY = 'noah-ready-open', KEEP_MS = 600_000;
/** 見せてよいか（open）と、今、並んでいる数（count。分からない時は null）。 */
export type NoahReadyOpen = { open: boolean; count: number | null };
const CLOSED: NoahReadyOpen = { open: false, count: null };
const shaped = (value: unknown): NoahReadyOpen | null => {
  const kept = value as { open?: unknown; count?: unknown } | null;
  if (!kept || typeof kept.open !== 'boolean') return null;
  return { open: kept.open, count: typeof kept.count === 'number' && Number.isSafeInteger(kept.count) && kept.count >= 0 ? kept.count : null };
};

/**
 * 「すぐ使える」（/noah/ready）を、その人に見せてよいか。一覧の API（GET /api/noah/intake?limit=0）が 200 を返した時だけ真。
 * 閉じている間、審査者でない人には、入口（components/noah-ready-entry.tsx）が出ない。結果は、この tab で 10 分持つ（開くたびに問い合わせない）。
 * 見せるかどうかの目安にだけ使う。読めるかどうかを決めるのは、いつも API の側。
 */
export function useNoahReadyOpen(): NoahReadyOpen {
  const [state, setState] = useState<NoahReadyOpen>(CLOSED);
  useEffect(() => {
    let stopped = false;
    try {
      const kept = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as { at?: number } | null;
      const value = kept && typeof kept.at === 'number' && Date.now() - kept.at < KEEP_MS ? shaped(kept) : null;
      if (value) {
        // 控えの値を出すのは、表示の後（サーバーが出した HTML と、最初の表示を同じにする）。
        const frame = requestAnimationFrame(() => { if (!stopped) setState(value); });
        return () => { stopped = true; cancelAnimationFrame(frame); };
      }
    } catch { /* 読めない控えは、使わない。 */ }
    void fetch('/api/noah/intake?limit=0', { cache: 'no-store' }).then(async (response) => {
      let next = CLOSED;
      if (response.status === 200) {
        const body = await response.json() as { counts?: { ran?: unknown; new?: unknown } };
        const ran = body.counts?.ran, fresh = body.counts?.new;
        next = { open: true, count: typeof ran === 'number' && typeof fresh === 'number' ? ran + fresh : null };
      } else void response.body?.cancel();
      try { window.sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), ...next })); } catch { /* 控えられなくても、出せる。 */ }
      if (!stopped) setState(next);
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, []);
  return state;
}
