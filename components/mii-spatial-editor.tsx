'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';
import type { WorkJob } from '@/lib/workflow';
import { createMiiPlanEditor } from '@/lib/mii-plan-edit';
import { miiFingerPoint, miiReplacement, resolveMiiPoint } from '@/lib/mii-spatial-input';
import { createMiiLocalSpeech, type MiiSpeechConstructor } from '@/lib/mii-local-speech';
import { CameraSession } from '@/systems/rock-star-os/targets/avocado-mini/gesture/camera-session.mjs';

const inputClock = () => performance.now();
const surfaces = [
  { id: 'title', left: 0.05, top: 0.05, right: 0.95, bottom: 0.3, editable: false },
  { id: 'objective', left: 0.05, top: 0.4, right: 0.95, bottom: 0.95, editable: true },
];
/** Software input/readback, with real local input adapters when available.
 * No calibration, optical output or physical-device acceptance is implied. */
export default function MiiSpatialEditor({ job, ownerScope, guard, onRead }: {
  job: WorkJob; ownerScope: string; guard: () => () => boolean; onRead: (job: WorkJob) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null), [text, setText] = useState('');
  const [message, setMessage] = useState(''), [inputStatus, setInputStatus] = useState('');
  const [proposal, setProposal] = useState<{ before: string; after: string; epoch: number; valid: () => boolean } | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false);
  const active = useRef(true), epoch = useRef(0), target = useRef<string | null>(null);
  const cameraPoint = useRef<{ id: string; at: number } | null>(null), cameraMode = useRef(false);
  const video = useRef<HTMLVideoElement | null>(null), camera = useRef<CameraSession | null>(null);
  const speech = useRef<ReturnType<typeof createMiiLocalSpeech> | null>(null);
  const editor = useRef<ReturnType<typeof createMiiPlanEditor> | null>(null);
  const pending = useRef(false);
  useLayoutEffect(() => {
    const ownedActive = active, ownedEpoch = epoch, ownedSpeech = speech, ownedCamera = camera;
    active.current = true;
    return () => { ownedActive.current = false; ownedEpoch.current++; ownedSpeech.current?.stop(); ownedCamera.current?.stop(); };
  }, []);
  usePendingSaveNavigation(Boolean(text) || unknown);
  useEffect(() => {
    const hide = () => { if (document.hidden) { epoch.current++; target.current = null; cameraPoint.current = null;
      speech.current?.stop(); camera.current?.stop(); setProposal(null); setConfirmed(false); setSelected(null); } };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); };
  }, []);
  function invalidate() { epoch.current++; speech.current?.stop(); setProposal(null); setConfirmed(false); }
  function select(id: string | null) {
    if (pending.current) return;
    if (target.current !== id) { invalidate(); target.current = id; setSelected(id); }
  }
  function stopInputs() {
    invalidate(); cameraMode.current = false; cameraPoint.current = null;
    camera.current?.stop(); camera.current = null; select(null); setInputStatus('カメラと音声を停止しました。');
  }
  async function startCamera() {
    if (pending.current || !video.current) return;
    stopInputs(); cameraMode.current = true;
    const session = new CameraSession({ video: video.current, mediaDevices: navigator.mediaDevices,
      createWorker: () => new Worker('/mii-input-runtime/tracking-worker.js'),
      bitmap: (v: HTMLVideoElement) => createImageBitmap(v), schedule: (cb: FrameRequestCallback) => requestAnimationFrame(cb), cancelSchedule: (id: number) => cancelAnimationFrame(id),
      maxDurationMs: 60000, maxFrames: 900,
      onFrame: (frame: { timestampMs: number; hands: unknown }) => {
        if (!active.current || camera.current !== session || pending.current) return;
        const now = performance.now(), point = miiFingerPoint(frame.hands, frame.timestampMs);
        const id = point ? resolveMiiPoint(point, surfaces, now) : null;
        cameraPoint.current = id ? { id, at: now } : null;
        select(id);
      }, onStatus: (state: string) => {
        if (!active.current || camera.current !== session) return;
        setInputStatus(state === 'running' ? '指先を枠内へ合わせてください。映像は端末内で処理します。' :
          ['loading','permission'].includes(state) ? 'カメラを準備しています。' : 'カメラ停止。追跡モデルの準備または利用許可を確認してください。');
        if (!['loading','permission','running'].includes(state)) { cameraPoint.current = null; select(null); }
      } });
    camera.current = session;
    try { await session.start(); } catch { if (active.current) setInputStatus('カメラを開始できません。端末内モデルと許可を確認してください。'); }
  }
  function selectedNow(now: number) {
    if (!active.current || target.current !== 'objective') return false;
    if (!cameraMode.current) return true;
    const point = cameraPoint.current;
    return !!point && point.id === 'objective' && now >= point.at && now - point.at <= 500;
  }
  function speak() {
    if (pending.current || !selectedNow(inputClock())) { setMessage('先に依頼内容を選んでください。'); return; }
    invalidate(); const captured = epoch.current;
    const host = window as unknown as { SpeechRecognition?: MiiSpeechConstructor };
    speech.current = createMiiLocalSpeech(host.SpeechRecognition, value => {
      if (active.current && epoch.current === captured && selectedNow(inputClock())) { setText(value); setProposal(null); setConfirmed(false); }
    }, value => { if (active.current && epoch.current === captured) setInputStatus(value); });
    void speech.current.start();
  }
  function preview() {
    if (pending.current) return;
    try {
      if (!selectedNow(inputClock())) throw new Error('selection');
      const valid = guard(), after = miiReplacement(text);
      if (!valid() || after === job.plan.objective) throw new Error('stale');
      invalidate();
      setProposal({ before: job.plan.objective, after, epoch: epoch.current, valid }); setMessage('変更先と本文を確認してください。');
    } catch { setProposal(null); setConfirmed(false); setMessage('対象・観測期限・変更内容を確認して、選び直してください。'); }
  }
  async function save() {
    if (!proposal || !confirmed || pending.current || !selectedNow(inputClock()) || epoch.current !== proposal.epoch || !proposal.valid()) {
      setProposal(null); setConfirmed(false); setMessage('入力が変わったか期限が切れました。選び直して確認してください。'); return;
    }
    const captured = proposal;
    pending.current = true; setBusy(true);
    editor.current = createMiiPlanEditor({ job, ownerScope, current: () => active.current, canSave: () => epoch.current === captured.epoch && captured.valid() });
    try {
      const result = await editor.current.save(captured.after, true);
      if (!active.current) return;
      if (result.state === 'saved' && result.job) { setText(''); setProposal(null); setConfirmed(false); setMessage('原本への保存を読み直して確認しました。'); onRead(result.job); }
      else if (result.state === 'conflict' && result.job) { setMessage('別の変更があります。最新の仕事で選び直してください。'); onRead(result.job); }
      else { setUnknown(true); setMessage('保存結果は未確認です。再送せず、同じ仕事を照合してください。'); }
    } catch { if (active.current) { pending.current = false; setMessage('保存前の確認が失効しました。選び直してください。'); } }
    finally { if (active.current) setBusy(false); }
  }
  async function reconcile() {
    if (!editor.current || busy) return;
    setBusy(true);
    const result = await editor.current.reconcile();
    if (!active.current) return;
    setBusy(false);
    if (result.job && result.state !== 'unknown') { setUnknown(false); setText(''); onRead(result.job); }
    else setMessage('まだ保存結果を確定できません。元の仕事の履歴も確認してください。');
  }
  return <section aria-label="声と指先で依頼内容を編集">
    <h3>声と指先で修正</h3>
    <p>まず仕事の依頼内容を編集できます。写真・サイト本文や精密3Dの編集は未対応です。指先はこの枠内の選択に使い、保存は別に確認します。</p>
    <div style={{ position: 'relative', width: '100%', maxWidth: 480, aspectRatio: '4 / 3', background: '#202522', color: '#e5e9e5', overflow: 'hidden' }}>
      <video ref={video} muted playsInline aria-label="端末内の手追跡映像" style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'fill', transform: 'scaleX(-1)', opacity: 0.3 }} />
      {surfaces.map(s => <button key={s.id} type="button" disabled={busy || unknown} aria-pressed={selected === s.id}
        onClick={() => { if (pending.current) return; cameraMode.current = false; camera.current?.stop(); select(s.id); }}
        style={{ position: 'absolute', left: `${s.left*100}%`, top: `${s.top*100}%`, width: `${(s.right-s.left)*100}%`, height: `${(s.bottom-s.top)*100}%`, overflow: 'auto', background: '#253329cc', color: 'inherit', outline: selected === s.id ? '2px solid #a4bda8' : '1px solid #68756b' }}>
        {s.id === 'title' ? `仕事名（閲覧のみ）：${job.title}` : `依頼内容を選択：${job.plan.objective}`}
      </button>)}
    </div>
    <p>{selected === 'objective' ? '依頼内容を選択中' : selected === 'title' ? '仕事名は閲覧のみです。依頼内容を選択してください。' : '対象を選んでください。'} · 原本の版 {job.revision}</p>
    <button type="button" disabled={busy || unknown} onClick={() => void startCamera()}>カメラで指先を選択</button>
    <button type="button" onClick={stopInputs}>入力を停止</button>
    <button type="button" disabled={busy || unknown || selected !== 'objective'} onClick={speak}>端末内の声で入力</button>
    <p>日本語の端末内音声が使えるブラウザーで動作します。未対応時は文字で入力できます。カメラは60秒、音声は15秒で停止します。</p>
    <label>変更する本文<textarea maxLength={1200} value={text} disabled={busy || unknown}
      onChange={event => { invalidate(); setText(event.target.value); }} placeholder="例：これを「庭のある家のサイトを作る」に変更して" /></label>
    <button type="button" disabled={busy || unknown || selected !== 'objective' || !text.trim()} onClick={preview}>変更内容を確認</button>
    {proposal && <div aria-label="原本変更の確認"><p>変更先：この仕事の依頼内容（版 {job.revision}）</p><p>変更前：{proposal.before}</p><p>変更後：{proposal.after}</p>
      <p>本人の指示による編集です。外部処理や有料実行は開始しません。保存先は同じ仕事です。</p>
      <label><input type="checkbox" checked={confirmed} disabled={busy || unknown} onChange={e => setConfirmed(e.target.checked)} />この本文で依頼内容を保存する</label>
      <button type="button" disabled={busy || unknown || !confirmed} onClick={() => void save()}>修正を保存</button></div>}
    {unknown && <button type="button" disabled={busy} onClick={() => void reconcile()}>保存結果だけを照合</button>}
    <p>保存後は同じ仕事を読み直して再開できます。再起動・移設後は対象を選び直します。未保存の本文と入力許可は引き継ぎません。</p>
    {inputStatus && <output>{inputStatus}</output>}{message && <p role="alert">{message}</p>}
  </section>;
}
