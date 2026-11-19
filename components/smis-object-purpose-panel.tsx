'use client';
import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { assessSmisObjectPurpose, smisObjectNeeds, smisObjectPurposeRequest, suggestSmisObjectNeeds, type SmisObjectNeed, type SmisPurposeReview } from '@/lib/smis-object-purpose';
import type { SmisInputContext } from '@/lib/smis-module-work-port';
import styles from './smis-object-purpose.module.css';

type Draft = { request: string; review: SmisPurposeReview | null; previousGoal: string };
const emptyDraft: Draft = { request: '', review: null, previousGoal: '' };
const DraftContext = createContext<{ draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; active: boolean; setActive: Dispatch<SetStateAction<boolean>> } | null>(null);
/** Unsaved tab-local purpose survives preparation of the account/runtime; no storage or execution. */
export function SmisObjectPurposeProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(emptyDraft), [active, setActive] = useState(false);
  return <DraftContext.Provider value={{ draft, setDraft, active, setActive }}>{children}</DraftContext.Provider>;
}
const ignoreContext = () => {};
export function SmisObjectPurposePreflight() {
  return <SmisObjectPurposePanel observation={null} workAvailable={false} canChange onContext={ignoreContext} previewOnly />;
}

export default function SmisObjectPurposePanel({ observation, workAvailable, canChange, onContext, previewOnly = false }: {
  observation: SmisInputContext | null; workAvailable: boolean; canChange: boolean;
  onContext: (context: SmisInputContext | null) => void; previewOnly?: boolean;
}) {
  const shared = useContext(DraftContext), [local, setLocal] = useState(emptyDraft);
  const { request, review, previousGoal } = shared?.draft ?? local, setDraft = shared?.setDraft ?? setLocal;
  const setRequest = (value: string) => setDraft(prior => ({ ...prior, request: value }));
  const setReview = (value: SmisPurposeReview | null) => setDraft(prior => ({ ...prior, review: value }));
  const setPreviousGoal = (value: string) => setDraft(prior => ({ ...prior, previousGoal: value }));
  const setActive = shared?.setActive;
  useEffect(() => { if (previewOnly || !setActive) return; setActive(true); return () => setActive(false); }, [previewOnly, setActive]);
  const [notice, setNotice] = useState('');
  const approval = useRef(0);
  const availability = { motion: !!observation?.valid(), work: workAvailable };
  const plan = review ? assessSmisObjectPurpose(review, availability) : null;
  function change(next: SmisPurposeReview) { approval.current++; onContext(null); setReview(next); setNotice(''); }
  function check() {
    if (!canChange || !request.trim()) return;
    change({ request: request.trim(), needs: suggestSmisObjectNeeds(request), other: '', confirmed: false });
  }
  function choose() {
    if (!canChange || !review || !plan?.ready) return;
    const input = smisObjectPurposeRequest(review, availability), usesMotion = review.needs.includes('motion');
    const token = ++approval.current;
    const selected = usesMotion ? observation : null;
    if (usesMotion && !selected?.valid()) { onContext(null); setNotice('部品の情報を確認し直してください。'); return; }
    onContext({ key: JSON.stringify([selected?.key ?? 'text-only', input]), request: input,
      suffix: selected?.suffix ?? '\n\n【使う情報】本人が入力した文章。部品の測定値は使っていません。',
      valid: () => approval.current === token && (!usesMotion || !!selected?.valid()) });
    setNotice('下のEveへ目的を引き継ぎます。作る担当と実行内容を確認してください。まだ実行は始めていません。');
  }
  if (previewOnly && shared?.active) return null;
  return <section className={styles.panel} aria-label="物を便利にする目的と必要なもの"><h3>Eveへ：どう便利にしたい？</h3>
    <label>やりたいこと<textarea maxLength={300} disabled={!canChange} value={request} placeholder="例：この植物の水やり時期を知らせて" onChange={event => { approval.current++; setRequest(event.target.value); setReview(null); setNotice(''); onContext(null); }} /></label>
    <button type="button" disabled={!canChange || !request.trim()} onClick={check}>今できることと、必要なものを確認する</button>
    <p>部品が届く前でも確認できます。物の名前だけでは機能を決めません。</p>
    {previewOnly && <p>実行するときは、下で本人のEve・会話・実行先を準備し、「物に付けた部品の情報も使う」を選んでください。入力した目的はこの画面内で引き継ぎます。画面を開き直すと未保存の目的は消えます。</p>}
    {previousGoal && <p>先ほどの目的はまだ実行していません：{previousGoal}</p>}
    {review && plan && <><h4>この目的に必要な働き</h4><p>候補を確認し、足りない働きを追加してください。文章だけを選ぶと、部品の測定や物の操作を含まない下書きになります。</p>
      <p>{plan.needs.join(" ／ ")}</p>
      <details><summary>必要な働きを追加・直す</summary><fieldset disabled={!canChange}><legend>使う情報と、してほしいこと</legend>
        {smisObjectNeeds.map(need => <label key={need.id} style={{ display: 'block' }}><input type="checkbox" disabled={need.id === 'text'} checked={need.id === 'text' || review.needs.includes(need.id)} onChange={event => change({ ...review, confirmed: false, needs: event.target.checked ? [...review.needs, need.id] : review.needs.filter(id => id !== need.id) })} />{need.label}</label>)}
        <label>このほかに必要な働き<input maxLength={200} value={review.other} onChange={event => change({ ...review, confirmed: false, other: event.target.value })} /></label>
      </fieldset></details>
      <label><input type="checkbox" disabled={!canChange} checked={review.confirmed} onChange={event => change({ ...review, confirmed: event.target.checked })} />目的に必要な働きを確認しました</label>
      <h4>今できること</h4>{plan.possible.length ? <ul>{plan.possible.map(item => <li key={item}>{item}</li>)}</ul> : <p>まだ接続・準備を確認できていません。</p>}
      {plan.missingParts.length > 0 && <><h4>準備に必要な部品</h4><p>すでに持っている物は追加購入不要です。接続と取り付けを確認してから使います。</p><ul>{plan.missingParts.map(item => <li key={item}>{item}</li>)}</ul></>}
      {plan.preparation.length > 0 && <><h4>部品以外に必要な準備</h4><ul>{plan.preparation.map(item => <li key={item}>{item}</li>)}</ul></>}
      <p>{!review.confirmed ? 'まず必要な働きを確認してください。' : plan.ready ? '確認した範囲の文章仕事をEveへ渡せます。実行前にもう一度内容を確認します。' : 'この目的には準備が残っています。担当の作成・実行はまだ始めません。'}</p>
      <button type="button" disabled={!canChange || !plan.ready} onClick={choose}>この内容でEveへ進む</button>
      {!plan.ready && availability.motion && <button type="button" disabled={!canChange} onClick={() => { setPreviousGoal(review.request); const next = '今確認した部品の動きの値を、時刻付きの短い観察メモにする'; setRequest(next); change({ request: next, needs: ['motion', 'text'] as SmisObjectNeed[], other: '', confirmed: false }); }}>目的を「今の動きの記録」に変更して試す</button>}
    </>}
    {notice && <output>{notice}</output>}
  </section>;
}
