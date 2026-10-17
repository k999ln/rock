'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { CampusId } from '@/lib/campus';
import styles from './sky-owned-agents.module.css';

type Purchase = {
  id: string;
  name: string;
  status: string;
  access: boolean;
};
type Purchases = { configured: boolean; purchases: Purchase[] };
type ReadState = 'loading' | 'signed_out' | 'unavailable' | 'ready';

const statusLabel: Record<string, string> = {
  pending: '支払い待ち',
  paid: '購入済み',
  refunded: '返金済み',
  partially_refunded: '一部返金済み',
  refund_pending: '返金確認中',
  disputed: '支払い確認中',
  expired: '決済期限切れ',
  failed: '支払い未完了',
};

export default function SkyOwnedAgents({ campusId }: { campusId?: CampusId }) {
  const [state, setState] = useState<ReadState>('loading');
  const [purchases, setPurchases] = useState<Purchases | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/sky/commerce/purchases', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401) {
        setState('signed_out');
        setPurchases(null);
        return;
      }
      if (!response.ok) throw new Error('Purchase read failed');
      setPurchases(await response.json() as Purchases);
      setState('ready');
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      setPurchases(null);
      setState('unavailable');
    });
    return () => controller.abort();
  }, [revision]);

  const returnTo = campusId ? `/sky/campus/${campusId}/hub` : '/sky';
  const market = campusId ? `/sky/marketplace?campus=${campusId}` : '/sky/marketplace';
  return <section className={styles.panel} aria-labelledby="sky-owned-agents-title">
    <div className={styles.heading}>
      <div><span>YOUR SKY LIBRARY</span><h2 id="sky-owned-agents-title">購入したAgent・Tool</h2></div>
      <Link href="/sky/purchases">購入履歴 <ArrowUpRight size={15} /></Link>
    </div>
    {state === 'loading' && <p>購入状態を確認しています…</p>}
    {state === 'signed_out' && <p><Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}>サインイン</Link>すると、自分の購入と利用権を確認できます。</p>}
    {state === 'unavailable' && <div className={styles.notice}><p>購入状態を確認できません。未確認のAgentを利用可能とは表示しません。</p><button type="button" onClick={refresh}><RefreshCw size={14} /> 再確認</button></div>}
    {state === 'ready' && purchases && !purchases.configured && <p>この環境ではMarketplace決済がまだ使えません。利用できるSky Toolは引き続き確認できます。</p>}
    {state === 'ready' && purchases?.configured && purchases.purchases.length === 0 && <div className={styles.notice}><p>購入したAgent・Toolはまだありません。</p><Link href={market}>Sky Marketで探す <ArrowRight size={15} /></Link></div>}
    {state === 'ready' && purchases?.purchases.slice(0, 4).map((item) => <div className={styles.row} key={item.id}>
      <div><strong>{item.name}</strong><span>{statusLabel[item.status] ?? '確認中'} · {item.status === 'paid' && item.access ? '利用権を確認済み。接続・実行条件は別確認' : '現在の利用権なし'}</span></div>
      <Link href={`/sky/purchases?order=${encodeURIComponent(item.id)}`}>状態を見る <ArrowRight size={15} /></Link>
    </div>)}
  </section>;
}
