'use client';
/**
 * 試行の入口（/noah/ready と、カードの詳細）。リンクの ?via=<札> を、この tab の sessionStorage に持ち、サインインしている時に 1 回だけ送る。
 * 札が登録されているか・開いているかは、サーバーが決める（知らない札では、行ができない）。もう試行に入っている本人には、送らない。
 * 切り替え（NOAH_TRIAL_OPEN）が閉の間は、入口が 404 を返すので、札を読みもしない。何も描かない。仕様: docs/noah/trial-300.md の 4・9 章。
 */
import { useEffect } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';

const KEY = 'noah-trial-via';
const SHAPE = /^[a-z0-9][a-z0-9-]{0,39}$/u;

export default function NoahTrialEntry({ via }: { via: string | null }) {
  useEffect(() => {
    let stopped = false;
    void fetch('/api/noah/trial?me=1', { cache: 'no-store' }).then(async (response) => {
      if (response.status !== 200 || stopped) return;
      const me = await response.json() as { ownerScope?: string | null; entered?: boolean };
      let held: string | null = null;
      try {
        if (via && SHAPE.test(via)) window.sessionStorage.setItem(KEY, via);
        held = window.sessionStorage.getItem(KEY);
      } catch { held = via && SHAPE.test(via) ? via : null; }
      if (!held || stopped) return;
      const forget = () => { try { window.sessionStorage.removeItem(KEY); } catch { /* 残っても、もう入った本人には送らない。 */ } };
      if (me.entered) { forget(); return; }
      // サインインの前は持っておくだけ（サインインから戻った画面が送る）。
      if (!me.ownerScope) return;
      const sent = await fetch('/api/noah/trial', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: me.ownerScope }, body: JSON.stringify({ action: 'enter', via: held }),
      });
      if (sent.status === 200) forget();
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, [via]);
  return null;
}
