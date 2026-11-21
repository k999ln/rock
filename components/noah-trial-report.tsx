'use client';
/**
 * カードの詳細の下（/noah/ready/agent?from=<カードの ID>）: 試行の本人の報告と、5 人以上が報告したカードの合計。
 * 報告は任意。入れられるのは、「稼ぐ・仕事を省く」の棚のカードで、その道具を動かして成果が返った、試行の参加者だけ（サーバーが決める）。
 * 金額を約束しない。出すのは、測った合計の文（サーバーが作る）だけ。切り替えが閉の間は、何も出さない。仕様: docs/noah/trial-300.md の 4・5・9 章。
 */
import { useEffect, useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-ready.module.css';

type Report = { listed: boolean; sold: number; netYen: number; minutes: number; reportedAt: number };
type Card = { summary: string | null; eligible: boolean; report: Report | null; ownerScope: string | null };
const digits = (value: string) => (/^\d{1,9}$/u.test(value) ? Number(value) : NaN);

export default function NoahTrialReport({ packageId }: { packageId: string }) {
  const [card, setCard] = useState<Card | null>(null), [listed, setListed] = useState<boolean | null>(null);
  const [sold, setSold] = useState(''), [netYen, setNetYen] = useState(''), [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {
    let stopped = false;
    void fetch(`/api/noah/trial?${new URLSearchParams({ card: packageId }).toString()}`, { cache: 'no-store' }).then(async (response) => {
      if (response.status !== 200) return;
      const body = await response.json() as Card;
      if (stopped) return;
      setCard(body);
      if (body.report) { setListed(body.report.listed); setSold(String(body.report.sold)); setNetYen(String(body.report.netYen)); setMinutes(String(body.report.minutes)); }
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, [packageId]);
  if (!card || (!card.summary && !card.eligible)) return null;

  async function send() {
    if (busy || !card?.ownerScope) return;
    const values = { sold: listed ? digits(sold || '0') : 0, netYen: listed ? digits(netYen || '0') : 0, minutes: digits(minutes || '0') };
    if (listed === null) { setError('出品したかを選んでください。'); return; }
    if (Object.values(values).some((value) => !Number.isSafeInteger(value))) { setError('数は、0 以上の整数で入れてください。'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/noah/trial', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: card.ownerScope },
        body: JSON.stringify({ action: 'report', packageId, listed, ...values }),
      });
      const body = await response.json() as { report?: Report; error?: string };
      if (response.status === 200 && body.report) { setCard({ ...card, report: body.report }); setNotice('報告しました。いつでも直せます。'); }
      else setError(body.error ?? '報告を保存できません。');
    } catch { setError('報告を保存できません。通信を確かめてください。'); } finally { setBusy(false); }
  }

  return <section className={styles.section} aria-labelledby="noah-trial-report">
    <h2 id="noah-trial-report">試した人の報告</h2>
    {card.summary ? <p className={styles.sectionNote}>{card.summary}（約束ではありません）</p> : null}
    {card.eligible && <form className={styles.trialForm} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <p className={styles.quiet}>報告は任意です。しなくても、カードは同じように使えます。名前は出しません。5 人以上が報告したカードだけ、合計を出します。</p>
      <fieldset>
        <legend>自分の出品として出しましたか</legend>
        <button type="button" aria-pressed={listed === true} onClick={() => setListed(true)}>出品した</button>
        <button type="button" aria-pressed={listed === false} onClick={() => setListed(false)}>していない</button>
      </fieldset>
      {listed && <>
        <label>売れた件数<input inputMode="numeric" value={sold} maxLength={3} onChange={(event) => setSold(event.target.value)} /></label>
        <label>手取り（円。販売先の手数料を引いた後）<input inputMode="numeric" value={netYen} maxLength={9} onChange={(event) => setNetYen(event.target.value)} /></label>
      </>}
      <label>掛けた分<input inputMode="numeric" value={minutes} maxLength={6} onChange={(event) => setMinutes(event.target.value)} /></label>
      {error && <p className={styles.reason} role="alert">{error}</p>}
      {notice && <output className={styles.notice}>{notice}</output>}
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? '送っています…' : card.report ? '報告を直す' : '報告する'}</button>
    </form>}
  </section>;
}
