'use client';
/**
 * 運営の画面（/noah/review）の「棚」の節。カードごとに、状態・載せていない理由（8 つの文）・動かして確かめた日・実績の数。「確かめた」「外す」。
 * カードを置く（書き換える）のは、カードの JSON を貼って「置く」。置いたカードは、いつも下書きに戻る（動かしてから「確かめた」を押す）。
 * 審査者でなければ、入口が 404 を返すので、何も出さない。仕様: docs/noah/spec-110-shelf.md の 10 章。
 */
import { useEffect, useState } from 'react';
import type { NoahShelfStateCard } from '@/lib/noah-shelf-view';
import styles from './noah-intake-review.module.css';

type State = { cards: NoahShelfStateCard[]; warnings: string[]; ownerScope: string; error?: string };
const SHELF_NAMES: Record<string, string> = { earn: '稼ぐ・仕事を省く', learn: '教育', life: '暮らし' };
const STATUS_NAMES: Record<string, string> = { draft: '下書き', verified: '確かめた', retired: '外した' };
const date = (value: number | null) => (value === null ? 'まだありません' : new Date(value).toLocaleString('ja-JP'));

export default function NoahShelfReview({ ownerScope }: { ownerScope: string }) {
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0), [pending, setPending] = useState(false), [draft, setDraft] = useState(''), [expert, setExpert] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/noah/shelf?state=1', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (response.status === 404) return;
      const data = await response.json() as State;
      if (!response.ok) throw Error(data.error ?? '棚を確認できません。');
      if (data.ownerScope !== ownerScope) throw Error('アカウントが変わりました。再読込してください。');
      if (!controller.signal.aborted) { setState(data); setError(''); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '棚を確認できません。'); });
    return () => controller.abort();
  }, [ownerScope, refresh]);

  async function send(body: Record<string, unknown>, done: string) {
    if (!state || state.ownerScope !== ownerScope) return false;
    setPending(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/noah/shelf', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': ownerScope }, body: JSON.stringify(body) });
      const result = await response.json() as { ownerScope?: string; error?: string; listed?: boolean; reasonText?: string | null };
      if (!response.ok || result.ownerScope !== ownerScope) throw Error(result.error ?? '再読込してから操作してください。');
      setNotice(result.listed ? `${done}。棚に出ています。` : `${done}。${result.reasonText ?? ''}`);
      setRefresh((n) => n + 1);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : '保存できません。'); return false; } finally { setPending(false); }
  }
  /** カードを置く。JSON の配列なら、1 枚ずつ順に置く（最初の案をまとめて置く時）。置いたカードは下書き。 */
  async function put() {
    let input: unknown;
    try { input = JSON.parse(draft); } catch { setError('カードの JSON を確認してください。'); return; }
    const list = Array.isArray(input) ? input : [input];
    let placed = 0;
    for (const card of list) {
      const id = card && typeof card === 'object' ? (card as { id?: unknown }).id : undefined;
      const existing = state?.cards.find((row) => row.id === id);
      if (!(await send({ action: 'put', package: card, revision: existing?.revision ?? null }, list.length > 1 ? `${++placed} / ${list.length} 枚を置きました` : '置きました'))) return;
    }
    setDraft('');
  }
  function reviewed(card: NoahShelfStateCard) {
    const at = Date.parse(expert[card.id] ?? '');
    if (!Number.isFinite(at)) { setError('確かめた日を入れてください。'); return; }
    void send({ action: 'review', id: card.id, revision: card.revision, expertAt: at }, '専門家に確かめた日を記録しました');
  }

  if (!state && !error) return null;
  return <section className={styles.intake} aria-labelledby="noah-shelf-heading">
    <h2 id="noah-shelf-heading">棚</h2>
    {error && <p role="alert">{error}</p>}
    {notice && <output>{notice}</output>}
    <button type="button" disabled={pending} onClick={() => setRefresh((n) => n + 1)}>更新する</button>
    {state && <>
      <p>棚に出ている数：{state.cards.filter((card) => card.listed).length} ／ カード {state.cards.length} 枚</p>
      {state.cards.length === 0 && <p>カードは、まだありません。</p>}
      {state.cards.map((card) => <div key={card.id}>
        <h3>{card.title}</h3>
        <p>{SHELF_NAMES[card.shelf] ?? card.shelf} · {STATUS_NAMES[card.status] ?? card.status} · {card.listed ? '棚に出ています' : `${card.reasonText ?? '載せていません'}${card.reasonStep !== null ? `（工程 ${card.reasonStep + 1}）` : ''}`}</p>
        <p>動かして確かめた日：{date(card.verifiedAt)}{card.runs !== null ? ` ／ 成果が返った依頼 ${card.runs} 件` : ''}</p>
        {card.advice && <p>専門家に確かめた日：{date(card.reviewAt)}</p>}
        {card.status !== 'retired' && <>
          <button type="button" disabled={pending} onClick={() => { void send({ action: 'verify', id: card.id, revision: card.revision }, '確かめました'); }}>確かめた</button>
          <button type="button" disabled={pending} onClick={() => { void send({ action: 'retire', id: card.id, revision: card.revision }, '外しました'); }}>外す</button>
        </>}
        {card.advice && card.status !== 'retired' && <form onSubmit={(event) => { event.preventDefault(); reviewed(card); }}>
          <label>専門家に確かめた日 <input type="date" value={expert[card.id] ?? ''} onChange={(event) => setExpert((old) => ({ ...old, [card.id]: event.target.value }))} /></label>
          <button type="submit" disabled={pending}>記録する</button>
        </form>}
      </div>)}
      <form onSubmit={(event) => { event.preventDefault(); void put(); }}>
        <label>カードを置く（noah-package/1 の JSON。配列なら、まとめて置きます。同じ ID のカードは書き換え、下書きに戻ります）<textarea value={draft} rows={8} maxLength={16_000} onChange={(event) => setDraft(event.target.value)} /></label>
        <button type="submit" disabled={pending || !draft.trim()}>置く</button>
      </form>
      {state.warnings.map((warning) => <output key={warning}>{warning}</output>)}
    </>}
  </section>;
}
