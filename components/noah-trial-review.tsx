'use client';
/**
 * 運営の画面（/noah/review）の「試行」の節: 今の段、段ごとの 4 つの数と割合、足りない条件、経路ごとの数（5 人以上）、カードごとの報告の合計（5 人以上）。
 * 経路の札を足す・閉じる。札を足しても、切り替え（NOAH_TRIAL_OPEN）が閉の間は、リンクから入口はできない。
 * 審査者でなければ、入口が 404 を返すので、何も出さない。仕様: docs/noah/trial-300.md の 3・4・7・9 章。
 */
import { useEffect, useState } from 'react';
import styles from './noah-intake-review.module.css';

type Counts = { pressed: number; connected: number; firstResult: number; returned: number };
type Wave = { wave: number; people: number; counts: Counts; done: boolean; rates: { connect: number; firstResult: number; returned: number }; text: string[] };
type State = {
  current: number; waves: Wave[]; open: boolean; ownerScope: string;
  funnel: { via: string; entered: number; connected: number; firstResult: number }[];
  earn: { packageId: string; summary: string }[];
  channels: { via: string; label: string; wave: number; createdAt: number; closedAt: number | null }[];
  error?: string;
};
const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function NoahTrialReview({ ownerScope }: { ownerScope: string }) {
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [pending, setPending] = useState(false);
  const [via, setVia] = useState(''), [label, setLabel] = useState(''), [wave, setWave] = useState('1');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/noah/trial?state=1', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (response.status === 404) return;
      const data = await response.json() as State;
      if (!response.ok) throw Error(data.error ?? '試行を確認できません。');
      if (data.ownerScope !== ownerScope) throw Error('アカウントが変わりました。再読込してください。');
      if (!controller.signal.aborted) { setState(data); setError(''); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '試行を確認できません。'); });
    return () => controller.abort();
  }, [ownerScope, refresh]);

  async function send(body: Record<string, unknown>) {
    if (pending || !state || state.ownerScope !== ownerScope) return false;
    setPending(true); setError('');
    try {
      const response = await fetch('/api/noah/trial', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': ownerScope }, body: JSON.stringify(body) });
      const result = await response.json() as { ownerScope?: string; error?: string };
      if (!response.ok || result.ownerScope !== ownerScope) throw Error(result.error ?? '再読込してから操作してください。');
      setRefresh((n) => n + 1);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : '保存できません。'); return false; } finally { setPending(false); }
  }

  if (!state && !error) return null;
  return <section className={styles.intake} aria-labelledby="noah-trial-heading">
    <h2 id="noah-trial-heading">試行</h2>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={pending} onClick={() => setRefresh((n) => n + 1)}>更新する</button>
    {state && <>
      <p>切り替え（リンクからの入口と、本人の報告）：{state.open ? '開' : '閉'} ／ 今の段：{state.current}</p>
      {state.waves.map((item) => <div key={item.wave}>
        <h3>段 {item.wave}（成果まで行った人 {item.people} 人まで）</h3>
        <p>「接続」を押した人 {item.counts.pressed} ／ つながった人 {item.counts.connected} ／ 成果まで行った人 {item.counts.firstResult} ／ また使った人 {item.counts.returned}</p>
        <p>つながる割合 {percent(item.rates.connect)} ／ 成果まで行く割合 {percent(item.rates.firstResult)} ／ また使う割合 {percent(item.rates.returned)}</p>
        {item.text.map((line) => <p key={line}>{line}</p>)}
      </div>)}
      <h3>経路ごと（5 人以上の経路だけ）</h3>
      {state.funnel.length === 0 ? <p>まだありません。</p> : state.funnel.map((row) => <p key={row.via}>{row.via}：入った人 {row.entered} ／ つながった人 {row.connected} ／ 成果まで行った人 {row.firstResult}</p>)}
      <h3>カードごとの報告（5 人以上のカードだけ）</h3>
      {state.earn.length === 0 ? <p>まだありません。</p> : state.earn.map((row) => <p key={row.packageId}>{row.packageId}：{row.summary}</p>)}
      <h3>経路の札</h3>
      {state.channels.length === 0 && <p>札は、まだありません。</p>}
      {state.channels.map((row) => <p key={row.via}>{row.via}（{row.label}・段 {row.wave}）{row.closedAt === null
        ? <> <button type="button" disabled={pending} onClick={() => { void send({ action: 'close', via: row.via }); }}>閉じる</button></>
        : ' ・閉じました'}</p>)}
      <form onSubmit={(event) => { event.preventDefault(); void send({ action: 'channel', via: via.trim(), label: label.trim(), wave: Number(wave) }).then((ok) => { if (ok) { setVia(''); setLabel(''); } }); }}>
        <label>札（リンクの ?via= に付ける。英小文字・数字・ハイフン）<input value={via} maxLength={40} onChange={(event) => setVia(event.target.value)} /></label>
        <label>名前（この画面にだけ出す）<input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} /></label>
        <label>段 <select value={wave} onChange={(event) => setWave(event.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <button type="submit" disabled={pending || !via.trim() || !label.trim()}>札を足す</button>
      </form>
    </>}
  </section>;
}
