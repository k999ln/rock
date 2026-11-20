'use client';
import { useEffect, useState } from 'react';

const KEY = 'noah-ready-open', KEEP_MS = 600_000;
/**
 * 「すぐ使える」（/noah/ready）を、その人に見せてよいか。一覧の API（GET /api/noah/intake?limit=0）が 200 を返した時だけ真。
 * 閉じている間、審査者でない人には、menu の行が出ない。結果は、この tab で 10 分持つ（開くたびに問い合わせない）。
 * 見せるかどうかの目安にだけ使う。読めるかどうかを決めるのは、いつも API の側。
 */
export function useNoahReadyOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let stopped = false;
    try {
      const kept = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as { at?: number; open?: boolean } | null;
      if (kept && typeof kept.at === 'number' && Date.now() - kept.at < KEEP_MS && typeof kept.open === 'boolean') {
        // 控えの値を出すのは、表示の後（サーバーが出した HTML と、最初の表示を同じにする）。
        const frame = requestAnimationFrame(() => { if (!stopped) setOpen(kept.open === true); });
        return () => { stopped = true; cancelAnimationFrame(frame); };
      }
    } catch { /* 読めない控えは、使わない。 */ }
    void fetch('/api/noah/intake?limit=0', { cache: 'no-store' }).then((response) => {
      const next = response.status === 200;
      void response.body?.cancel();
      try { window.sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), open: next })); } catch { /* 控えられなくても、出せる。 */ }
      if (!stopped) setOpen(next);
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, []);
  return open;
}
