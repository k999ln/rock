'use client';

import { useRef, useState } from 'react';
import { noahWorkHref } from '@/lib/noah-work-view';
import { OWNER_SCOPE_HEADER, readOwnerScope } from '@/lib/owner-intent';
import styles from '@/app/noah/engineering/combinations/eve-combinations.module.css';

export default function EveStartRevenueWork({ combinationId, version }: { combinationId: string; version: number }) {
  const sending = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const check = await fetch('/api/noah/ask', { cache: 'no-store' });
      const owner = check.ok ? await check.json() as { ownerScope?: unknown } : null;
      const scope = readOwnerScope(owner?.ownerScope);
      if (!scope) throw Error('保存先の本人確認ができません。接続を確認してください。');
      const key = ['noah-revenue-request', scope, combinationId, version].join('/');
      if (attempt.current && attempt.current.key !== key) throw Error('保存先が変わりました。この案件を開き直してください。');
      if (!attempt.current) {
        let previous: string | null = null;
        try { previous = sessionStorage.getItem(key); } catch { /* The current tab can still retry in memory. */ }
        const id = previous && /^[a-f0-9-]{36}$/.test(previous) ? previous : crypto.randomUUID();
        attempt.current = { key, id };
        try { sessionStorage.setItem(key, id); } catch { /* Optional retry persistence. */ }
      }
      const response = await fetch('/api/noah/revenue/work', {
        method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope },
        body: JSON.stringify({ combinationId, requestId: attempt.current.id }),
      });
      const result = await response.json() as { workId?: unknown; ownerScope?: unknown };
      if (response.status === 401) throw Error('本人確認が必要です。マイAgentで保存先を確認してください。');
      if (response.status === 429) throw Error('本日の受付上限に達しました。明日もう一度お試しください。');
      if (!response.ok || typeof result.workId !== 'string' || !result.workId || result.ownerScope !== scope)
        throw Error(response.status === 409 ? '保存先を確認して、もう一度開いてください。' : '収益の記録を開けませんでした。もう一度お試しください。');
      try { sessionStorage.removeItem(key); } catch { /* Optional retry persistence. */ }
      window.location.assign(noahWorkHref(result.workId));
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes('。') ? cause.message : '収益の記録を開けませんでした。接続を確認してください。');
      sending.current = false;
      setBusy(false);
    }
  }

  return <div className={styles.track}>
    <p>自分が運用する案件の成果承認・入金・費用を、マイAgentの仕事に記録します。</p>
    <button type="button" onClick={start} disabled={busy}>{busy ? '開いています…' : 'この案件の収益記録を始める'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
