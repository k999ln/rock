'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import { SkyNotice } from './sky-feedback';
import { skyAgentEvePath, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import { captureSmisCamera } from '@/lib/smis-camera';
import { createSmisInputSession } from '@/lib/smis-input-session';
import { matchSmisVisualObservation, readSmisVisualReferences, saveSmisVisualReference, smisVisualStorageKey, type SmisVisualFingerprint, type SmisVisualObservation, type SmisVisualReference } from '@/lib/smis-visual-input';
import { SMIS_OBJECT_HANDOFF_KEY, readSmisObjectHandoff, type SmisObjectHandoff } from '@/lib/smis-object-handoff';
import styles from './smis-camera-workspace.module.css';

export default function SmisCameraWorkspace() {
  const [agents, setAgents] = useState<SkyLibraryAgent[]>([]), [owner, setOwner] = useState(''), [selected, setSelected] = useState('');
  const [references, setReferences] = useState<SmisVisualReference[]>([]), [samples, setSamples] = useState<SmisVisualFingerprint[]>([]);
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off'), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [account, setAccount] = useState<'loading' | 'ready' | 'signin' | 'error'>('loading');
  const [candidate, setCandidate] = useState<{ reference: SmisVisualReference; observation: SmisVisualObservation } | null>(null);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), session = useRef(createSmisInputSession()), ownerRef = useRef(''), mounted = useRef(true), lock = useRef(false);
  const stop = useCallback(() => {
    session.current.cancel(); stream.current = null; lock.current = false; setBusy(false);
    if (video.current) video.current.srcObject = null;
    setCamera('off'); setCandidate(null);
  }, []);
  const fetchLibrary = useCallback(async () => {
    const response = await fetch('/api/sky/agents', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const data = await response.json() as { ownerUserId?: string; agents?: SkyLibraryAgent[]; error?: string };
    if (!response.ok || !data.ownerUserId || !Array.isArray(data.agents)) {
      throw Object.assign(Error(data.error || '自分の担当を確認できません。接続を確認してください。'), { requiresLogin: response.status === 401 });
    }
    return { owner: data.ownerUserId, agents: data.agents };
  }, []);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void fetchLibrary().then(data => {
      if (!active || !mounted.current) return;
      ownerRef.current = data.owner; setOwner(data.owner); setAgents(data.agents); setAccount('ready');
      const requested = new URLSearchParams(location.search).get('agent') ?? '';
      setSelected(data.agents.find(a => a.id === requested && a.enabled && a.attachment)?.id ?? data.agents.find(a => a.enabled && a.attachment)?.id ?? '');
      try { setReferences(readSmisVisualReferences(localStorage, data.owner, data.agents)); } catch (reason) { setError(reason instanceof Error ? reason.message : '覚えた対象を読めません。'); }
    }).catch(reason => { if (active && mounted.current) { setAccount(reason?.requiresLogin === true ? 'signin' : 'error'); setError(reason instanceof Error ? reason.message : '接続できません。'); } });
    const hidden = () => { if (document.visibilityState !== 'visible') stop(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', stop);
    return () => { active = false; mounted.current = false; stop(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', stop); };
  }, [fetchLibrary, stop]);
  useEffect(() => {
    if (camera !== 'on') return;
    const token = session.current.revision;
    const poll = setInterval(() => {
      void fetchLibrary().then(data => {
        if (!mounted.current || !session.current.current(token)) return;
        if (data.owner !== ownerRef.current || !data.agents.some(a => a.id === selected && a.enabled && a.revision === agents.find(prior => prior.id === selected)?.revision)) {
          stop(); setSamples([]); setReferences([]); setAgents([]); setOwner(''); ownerRef.current = ''; setError('アカウントか担当が変わりました。画面を開き直してください。'); setAccount('error');
        }
      }).catch(() => { if (mounted.current && session.current.current(token)) { stop(); setError('本人と担当の確認が途切れたため、カメラを止めました。'); } });
    }, 10_000);
    return () => clearInterval(poll);
  }, [camera, fetchLibrary, selected, agents, stop]);
  useEffect(() => {
    if (!candidate) return;
    const timeout = setTimeout(() => { setCandidate(null); setNotice('映像が古くなりました。もう一度、今の対象を確認してください。'); }, Math.max(0, candidate.observation.observedAt + 10_000 - Date.now()));
    return () => clearTimeout(timeout);
  }, [candidate]);
  const agent = agents.find(a => a.id === selected && a.enabled && a.attachment);
  async function currentAgent(id = selected, revision = agent?.revision) {
    const data = await fetchLibrary();
    const found = data.agents.find(a => a.id === id && a.revision === revision && a.enabled && a.attachment);
    if (data.owner !== ownerRef.current || !found) { throw Error('担当が変わったか、停止されています。自分の担当を確認してください。'); }
    return found;
  }
  async function start() {
    if (lock.current || !agent) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const mine = session.current.begin();
    try {
      if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('この画面ではカメラを使えません。安全な接続か、この端末内の試験用画面で開いてください。');
      await currentAgent();
      if (!session.current.current(mine) || !mounted.current) return;
      setCamera('starting');
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
      if (!session.current.current(mine) || !mounted.current || document.visibilityState !== 'visible') { next.getTracks().forEach(track => track.stop()); return; }
      if (!session.current.adopt(mine, () => next.getTracks().forEach(track => track.stop()))) return;
      stream.current = next;
      next.getTracks().forEach(track => { track.onended = () => { if (stream.current === next && mounted.current) { stop(); setNotice('カメラの利用が終了しました。'); } }; });
      if (!video.current) { stop(); return; }
      video.current.srcObject = next; await video.current.play();
      if (session.current.current(mine) && mounted.current) setCamera('on');
    } catch (reason) {
      if (!session.current.current(mine) || !mounted.current) return;
      stop();
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'カメラを使う許可がありません。使う場合は、この画面のカメラだけを許可してください。' : reason instanceof Error ? reason.message : 'カメラを開けません。');
    } finally { if (session.current.current(mine)) { lock.current = false; if (mounted.current) setBusy(false); } }
  }
  async function remember() {
    if (lock.current || !agent || camera !== 'on' || !video.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice(''); setCandidate(null);
    const mine = session.current.revision;
    let authorized = false;
    try {
      const fresh = await currentAgent(); authorized = true;
      if (!session.current.current(mine) || !video.current) return;
      const observation = captureSmisCamera(video.current);
      if (samples.length < 3) {
        if (observation.fingerprint.detail < 0.05) throw Error('見分ける手がかりが少ないため、対象を大きく映すか背景を変えてください。');
        setSamples(previous => [...previous, observation.fingerprint]);
      } else {
        const reference: SmisVisualReference = { schema: 'smis.visual-reference/1', owner, agentId: fresh.id, agentRevision: fresh.revision, objectName: fresh.attachment!.objectName, samples, background: observation.fingerprint };
        saveSmisVisualReference(localStorage, reference, agents);
        setReferences(readSmisVisualReferences(localStorage, owner, agents)); setSamples([]);
        setNotice(`${reference.objectName}の見た目を、この端末に覚えました。写真は保存していません。`);
      }
    } catch (reason) { if (mounted.current && session.current.current(mine)) { if (!authorized) stop(); setError(reason instanceof Error ? reason.message : '見た目を覚えられませんでした。'); } }
    finally { if (session.current.current(mine)) { lock.current = false; if (mounted.current) setBusy(false); } }
  }
  async function identify() {
    if (lock.current || !video.current || camera !== 'on') return;
    lock.current = true; setBusy(true); setError(''); setCandidate(null); setNotice('');
    const mine = session.current.revision;
    let authorized = false;
    try {
      await currentAgent(); authorized = true;
      if (!session.current.current(mine) || !video.current) return;
      const observation = captureSmisCamera(video.current);
      const result = matchSmisVisualObservation(observation, references, owner, Date.now());
      if (!result.candidate) { setNotice('はっきり見分けられませんでした。中央に対象を大きく映し、向きや明るさを合わせてください。'); return; }
      setCandidate({ reference: result.candidate, observation });
    } catch (reason) { if (mounted.current && session.current.current(mine)) { if (!authorized) stop(); setError(reason instanceof Error ? reason.message : '対象を確認できません。'); } }
    finally { if (session.current.current(mine)) { lock.current = false; if (mounted.current) setBusy(false); } }
  }
  async function openAgent() {
    if (lock.current || !candidate) return;
    lock.current = true; setBusy(true); setError('');
    const mine = session.current.revision;
    try {
      const matched = candidate;
      const fresh = await currentAgent(matched.reference.agentId, matched.reference.agentRevision);
      if (!mounted.current || !session.current.current(mine)) return;
      if (fresh.attachment!.objectName !== matched.reference.objectName) throw Error('対象の設定が変わりました。見た目を覚え直してください。');
      const handoff: SmisObjectHandoff = { schema: 'smis.object-handoff/1', owner, agentId: fresh.id, agentRevision: fresh.revision, objectName: fresh.attachment!.objectName, observedAt: matched.observation.observedAt, confirmedAt: Date.now(), source: matched.observation.source };
      const encoded = JSON.stringify(handoff);
      if (!readSmisObjectHandoff({ getItem: () => encoded }, owner, fresh, Date.now())) throw Error('映像が古くなったため、もう一度対象を確認してください。');
      sessionStorage.setItem(SMIS_OBJECT_HANDOFF_KEY, encoded);
      stop(); location.assign(skyAgentEvePath(fresh));
    } catch (reason) { if (mounted.current && session.current.current(mine)) { stop(); setError(reason instanceof Error ? reason.message : '担当を開けません。'); } }
    finally { if (session.current.current(mine)) { lock.current = false; if (mounted.current) setBusy(false); } }
  }
  return <WorkspaceShell title="カメラから担当につなぐ" tone="sky" onClickCapture={event => {
    // Camera permission policy belongs to the document, not an SPA route.
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(anchor instanceof HTMLAnchorElement) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === '_blank') return;
    const destination = new URL(anchor.href);
    if (destination.origin === location.origin && (destination.pathname !== location.pathname || destination.search !== location.search)) {
      event.preventDefault(); stop(); location.assign(anchor.href);
    }
  }}><div className={styles.page}>
    <Link href="/os/eve">Eveに戻る</Link><h1>実物から、自分の担当へ</h1>
    <p>ユーザーがEveで作った役割を、実物と結びます。まずは登録した見た目に近い候補を、この端末内で探します。</p>
    {error && <SkyNotice message={error} />}{notice && <output className={styles.notice} aria-live="polite">{notice}</output>}
    {account === 'loading' && <output>自分の担当を確認しています…</output>}
    {account === 'signin' && <Link href="/account?returnTo=%2Fsky%2Fobjects%2Fcamera">ログインして自分の担当を使う</Link>}
    {account === 'ready' && <section className={styles.panel}><h2>1. Eveで作った担当を選ぶ</h2>
      {agents.some(a => a.enabled && a.attachment) ? <label>つなぐ担当<select disabled={busy || camera !== 'off'} value={selected} onChange={event => { setSelected(event.target.value); setSamples([]); setCandidate(null); setNotice(''); }}><option value="">選んでください</option>{agents.filter(a => a.enabled && a.attachment).map(a => <option key={a.id} value={a.id}>{a.attachment!.objectName} · {a.name}</option>)}</select></label> : <p>まだ対象につなぐ担当がありません。</p>}
      {agent && <details><summary>この担当の役割を見る</summary><p style={{ whiteSpace: 'pre-wrap' }}>{agent.instructions}</p></details>}
      <p><Link href="/os/eve/create-agent">Eveで困りごとから担当を作る</Link></p>
    </section>}
    <section className={styles.panel}><h2>2. カメラで対象を確かめる</h2>
      <p>写真は外部へ送らず、保存もしません。マイクは使いません。覚えた見た目の特徴だけを、このブラウザーの自分用領域に保存します。</p>
      <div className={styles.preview} hidden={camera === 'off'}><video ref={video} muted playsInline aria-label="この端末のカメラ映像" /><span className={styles.frame} /></div>
      <div className={styles.actions}><button type="button" disabled={!agent || busy || camera !== 'off' || account !== 'ready'} onClick={() => void start()}>{camera === 'starting' ? 'カメラを開いています…' : 'カメラを使う'}</button><button type="button" disabled={camera === 'off' && !busy} onClick={() => { stop(); setSamples([]); setNotice('カメラを止めました。担当と保存済みの成果は残っています。'); }}>カメラを止める</button></div>
      {camera === 'on' && agent && <><p>{samples.length < 3 ? `中央の枠に${agent.attachment!.objectName}を大きく映してください。向きを少し変えながら3回覚えます（${samples.length}/3）。` : '対象をいったん枠から外して、背景だけを映してください。対象と背景を取り違えないために使います。'}</p>
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void remember()}>{samples.length < 3 ? 'この見た目を覚える' : '背景を覚えて登録する'}</button>{samples.length > 0 && <button type="button" disabled={busy} onClick={() => setSamples([])}>覚え直す</button>}</div>
        <p>覚えた対象：{references.length}件。担当の設定を変更・停止すると、その登録は使えなくなります。</p>
        <div className={styles.actions}><button type="button" disabled={busy || references.length === 0 || samples.length > 0} onClick={() => void identify()}>今の対象を確認する</button></div></>}
      <p className={styles.hint}>最初は同じ背景・近い向きでの試験です。よく似た物は取り違えることがあるため、候補は本人が確認してください。写真の内容理解や計測には、対応する処理やセンサーが必要です。</p>
      {owner && <details><summary>この端末で覚えた対象を消す</summary><p>担当の設定と成果は残ります。</p><button type="button" disabled={busy} onClick={() => { stop(); localStorage.removeItem(smisVisualStorageKey(owner)); setReferences([]); setSamples([]); setNotice('この端末で覚えた見た目を消しました。'); }}>見た目の登録を消す</button></details>}
    </section>
    {candidate && <section className={styles.candidate} aria-live="polite"><h2>{candidate.reference.objectName}に似ています</h2><p>合っていますか？確認すると、この対象につないだ担当をEveで開きます。仕事の実行や外部操作はまだ始まりません。</p><div className={styles.actions}><button type="button" disabled={busy} onClick={() => void openAgent()}>合っています。この担当を開く</button><button type="button" disabled={busy} onClick={() => { setCandidate(null); setNotice('別の担当には切り替えていません。もう一度確認できます。'); }}>違います</button></div></section>}
  </div></WorkspaceShell>;
}
