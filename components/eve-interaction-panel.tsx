'use client';
import { useEffect, useRef, useState } from 'react';
import { createEveInteractionSession, type EveWorkReference, type EveWorkPort, type EveInteractionState } from '@/lib/rockstar-eve-interaction';
import { startMiniLocalSpeech, type LocalSpeechConstructor } from '@/lib/mini-local-speech';

export default function EveInteractionPanel({ work, connected, pendingKey, executionNotice, preparesAgent = true, onPhase, previewRole, textFirst = false, savedWork = [], loadSavedWork }: { textFirst?: boolean; loadSavedWork?: (cursor:string)=>Promise<{references:EveWorkReference[];cursor:string|null}>; savedWork?: EveWorkReference[]; work: EveWorkPort; connected: boolean; pendingKey?: string; executionNotice: string; preparesAgent?: boolean; onPhase?: (phase: EveInteractionState['phase']) => void; previewRole?: (input: string) => {name: string; instructions: string} | null }) {
  const [state, setState] = useState<EveInteractionState>({ phase: 'disabled', request: '', message: '声の待ち受けは停止中です。', result: '', jobId: '' });
  const [olderWork,setOlderWork]=useState<EveWorkReference[]>([]),[historyCursor,setHistoryCursor]=useState<string|null|undefined>(undefined),[loadingHistory,setLoadingHistory]=useState(false);
  const historyBusy=useRef(false);
  const [microphone, setMicrophone] = useState(false), [error, setError] = useState(''), [typed, setTyped] = useState('');
  const hear=(text:string)=>controller.current?.hearFinal(text);
  const controller = useRef<ReturnType<typeof createEveInteractionSession> | null>(null), speech = useRef<AbortController | null>(null), mounted = useRef(false);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    let storage: Storage;
    try { storage = window.sessionStorage; }
    catch { queueMicrotask(() => { if (active) setError('この画面で依頼番号を保存できません。ブラウザーの保存設定を確認してください。音声と仕事は始めていません。'); }); return () => { active = false; mounted.current = false; }; }
    const session = createEveInteractionSession({ work, pendingKey, storage, changed: next => { if (active && mounted.current) { setState(next); onPhase?.(next.phase); } } });
    controller.current = session;
    queueMicrotask(() => { if (active) { setState(session.state); setError(''); setTyped(''); setMicrophone(false); } });
    const leave = () => { speech.current?.abort(); speech.current = null; setMicrophone(false); void session.stop(true); };
    const hidden = () => { if (document.visibilityState !== 'visible') leave(); };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void session.refresh(); }, 1500);
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leave);
    return () => { active = false; mounted.current = false; leave(); clearInterval(timer); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leave); controller.current = null; };
  }, [work, pendingKey, onPhase]);
  async function loadHistory(restart=false) {
    if (!loadSavedWork || historyBusy.current || (!restart && historyCursor === null)) return;
    historyBusy.current=true;setLoadingHistory(true);setError('');
    try {
      const page=await loadSavedWork(restart?'':historyCursor??'');
      if (!mounted.current) return;
      setOlderWork(page.references);setHistoryCursor(page.cursor);
    } catch (reason) { if(mounted.current)setError(reason instanceof Error?reason.message:'保存済み仕事を確認できません。'); }
    finally { historyBusy.current=false;if(mounted.current)setLoadingHistory(false); }
  }
  async function start() {
    speech.current?.abort(); const signal = new AbortController(); speech.current = signal; setError('');
    const session = controller.current;
    try {
      const browser = window as unknown as { SpeechRecognition?: LocalSpeechConstructor };
      await startMiniLocalSpeech(browser.SpeechRecognition, signal.signal, text => session?.hearFinal(text), message => { if (mounted.current) { setError(message); setMicrophone(false); } void session?.stop(true); });
      if (signal.signal.aborted || !mounted.current) return;
      session?.arm(); setMicrophone(true);
    } catch (reason) { if (!signal.signal.aborted && mounted.current) { setError(reason instanceof Error ? reason.message : '音声入力を始められません。'); setMicrophone(false); } }
  }
  let role: {name:string;instructions:string}|null=null;
  if(state.phase==='review'&&previewRole){try{role=previewRole(state.request);}catch{role=null;}}
  return <section aria-label={textFirst?'Eveで担当を作り実行する':'Eveの共通音声操作'}>
    {textFirst&&<form onSubmit={event=>{event.preventDefault();controller.current?.arm();controller.current?.hearFinal('Hey Eve');hear(typed);}}><label>{preparesAgent?'作りたい担当・やってほしいこと':'この担当への依頼'}<textarea rows={4} maxLength={1000} value={typed} onChange={event=>setTyped(event.target.value)} placeholder="例：新しいアイデアを短い案内文にする担当を作って"/></label><button type="submit" disabled={!connected||!typed.trim()||!['disabled','standby','listening','review'].includes(state.phase)}>Eveと内容を確認する</button><p>確認するだけでは登録や実行は始まりません。役割を直す場合は文章を編集して確認し直せます。</p></form>}
    <details open={!textFirst}><summary>声でも操作する</summary><h2>Hey Eveから始める</h2>
    <p>この端末の画面を開いている間だけ使う、本人用の2分間の音声試験です。最初にマイクを許可してください。待機中も呼びかけを聞きます。完全な電源OFFとは別です。</p>
    <p>「Hey Eve」→依頼を話す→聞き取った内容を確認→{preparesAgent ? '担当を作って実行' : '選んだ担当で実行'}。「Thanks Eve」で、この会話の仕事を止めて待機へ戻ります。</p>
    <p>現在は文章の下書きに対応します。音声は端末内で処理できる場合だけ使い、録音や言語データの自動取得はしません。</p>
    <button type="button" disabled={!connected || microphone} onClick={() => void start()}>声の待ち受けを始める</button>
    <button type="button" onClick={() => { speech.current?.abort(); speech.current = null; setMicrophone(false); void controller.current?.stop(true); }}>マイクと、この会話の仕事を止める</button>
    </details>
    <output>{microphone ? 'マイク使用中 · ' : 'マイク停止中 · '}{state.message}</output>
    {loadSavedWork&&<div><button type="button" disabled={loadingHistory||historyCursor===null} onClick={()=>void loadHistory()}>以前の端末実行を50件ずつ読む</button>{historyCursor!==undefined&&<button type="button" disabled={loadingHistory} onClick={()=>void loadHistory(true)}>端末実行履歴の最初から読む</button>}<p>この一覧は読込時点の記録です。選ぶと同じ仕事を読み直します。表示は1ページずつで、再実行はしません。</p>{historyCursor===null&&<p>この会話の端末実行履歴を最後まで読みました。</p>}</div>}
    {(savedWork.length>0||olderWork.length>0)&&<div><h3>保存済みの仕事を引き継ぐ</h3><p>今選んでいる担当・AI・実行先と一致する仕事です。読み直すだけで、再実行しません。</p>{[...savedWork,...olderWork.filter(ref=>!savedWork.some(saved=>saved.id===ref.id))].map(ref=><button key={ref.id} type="button" disabled={!['disabled','standby'].includes(state.phase)} onClick={()=>void controller.current?.resume(ref)}>同じ仕事を確認：{ref.input.slice(0,80)}</button>)}</div>}
    {error && <p role="alert">{error}</p>}
    {state.phase === 'review' && <><p>依頼：{state.request}</p>{role&&<><h3>作成する担当：{role.name}</h3><details><summary>この担当の役割を確認</summary><p style={{whiteSpace:'pre-wrap'}}>{role.instructions}</p></details></>}<p>{executionNotice}</p><button type="button" disabled={!connected} onClick={() => void controller.current?.confirm()}>{preparesAgent ? 'この内容で担当を作り、実行する' : 'この内容を選んだ担当で実行する'}</button></>}
    {['running', 'result', 'unknown', 'stopping'].includes(state.phase) && <button type="button" onClick={() => void controller.current?.stop()}>この会話を終えて、停止を確認する</button>}
    {state.result && <div><h3>担当からの成果</h3><p style={{ whiteSpace: 'pre-wrap' }}>{state.result}</p><p>同じ仕事は下の成果一覧から確認・保存できます。</p></div>}
    {!textFirst&&<details><summary>声を使えないときの同じ操作</summary><p>ボタンと文字で操作できます。この操作は音声認識の合格には数えません。</p><button type="button" onClick={() => { controller.current?.arm(); controller.current?.hearFinal('Hey Eve'); }}>Eveに呼びかける</button><label>依頼する内容<textarea maxLength={1000} value={typed} onChange={event => setTyped(event.target.value)} /></label><button type="button" onClick={() => controller.current?.hearFinal(typed)}>依頼を確認する</button><button type="button" onClick={() => void controller.current?.stop()}>Thanks Eve · 終わる</button></details>}
  </section>;
}
