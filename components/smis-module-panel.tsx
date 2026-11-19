'use client';
import { useEffect, useRef, useState } from 'react';
import { createSmisModuleSession, smisModuleRequestSuffix } from '@/lib/smis-module-session';
import { connectSmisMicrobit, type SmisBluetooth } from '@/lib/smis-microbit-bluetooth';
import SmisObjectPurposePanel from './smis-object-purpose-panel';
import type { SmisInputContext } from '@/lib/smis-module-work-port';

export default function SmisModulePanel({ owner, enabled, canChange, workAvailable, onContext }: {
  owner: string; enabled: boolean; canChange: boolean; workAvailable: boolean; onContext: (context: SmisInputContext | null) => void;
}) {
  const [session] = useState(() => createSmisModuleSession({ owner }));
  const [view, setView] = useState(session.view), [name, setName] = useState(''), [notice, setNotice] = useState('');
  const [observation, setObservation] = useState<SmisInputContext | null>(null);
  const observationEpoch = useRef(0);
  const [busy, setBusy] = useState(false), [captured, setCaptured] = useState('');
  const connecting = useRef(false), mounted = useRef(false), connection = useRef<AbortController | null>(null);
  function refresh() { if (mounted.current) setView(session.view); }
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      const current = session.view; setView(current);
      if (current.connected && !current.fresh && current.checked) {
        session.detach(); onContext(null); setObservation(null); setCaptured('');
        setNotice('部品の新しい情報が届かないため、この物との接続を外しました。仕事の停止は下のEveで確認してください。');
      }
    }, 1000);
    const leave = () => { connection.current?.abort(); session.disconnect(); onContext(null); setObservation(null); };
    const hidden = () => { if (document.visibilityState !== 'visible') leave(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leave);
    return () => { mounted.current = false; clearInterval(timer); leave(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leave); };
  }, [session, onContext]);
  useEffect(() => { let active = true; if (!enabled) { connection.current?.abort(); session.disconnect(); onContext(null); queueMicrotask(() => { if (active) setObservation(null); }); } return () => { active = false; }; }, [enabled, session, onContext]);
  async function connect() {
    if (!enabled || !canChange || connecting.current) return;
    const bluetooth = (navigator as unknown as { bluetooth?: SmisBluetooth }).bluetooth;
    if (!window.isSecureContext || !bluetooth) { setNotice('この画面はBluetooth接続に対応していません。Pixelの対応するChromeで本人用のlocalhost画面を開いてください。アプリ内の画面では使えない場合があります。'); return; }
    connecting.current = true; setBusy(true); setNotice('部品を選んでください。自動では探し始めません。');
    connection.current?.abort(); const controller = new AbortController(); connection.current = controller;
    try {
      await connectSmisMicrobit(bluetooth, { signal: controller.signal,
        connected: id => { session.connect(id); onContext(null); setObservation(null); setCaptured(''); refresh(); },
        motion: value => { session.observe(value); refresh(); },
        disconnected: () => { session.disconnect(); onContext(null); setObservation(null); if (mounted.current) { setCaptured(''); setNotice('部品の接続を終了しました。進行中だった仕事の停止は、下のEveで確認してください。'); refresh(); } },
      });
      if (mounted.current && !controller.signal.aborted) setNotice('動きを送る部品に接続しました。次に取り付けた物を確認します。');
    } catch (error) { if (mounted.current && !controller.signal.aborted) setNotice(error instanceof Error ? error.message : '部品に接続できません。'); }
    finally { connecting.current = false; if (mounted.current) setBusy(false); }
  }
  function attach() {
    if (!enabled || !canChange) return;
    try { session.attach(name); onContext(null); setObservation(null); setCaptured(''); setNotice('取り付けた物をゆっくり傾け、下の値が変わることを確認してください。'); refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '取り付けを確認できません。'); }
  }
  function capture() {
    if (!enabled || !canChange) return;
    try {
      session.confirmMovement(); const snapshot = session.snapshot();
      const token = ++observationEpoch.current;
      onContext(null);
      setObservation({ key: snapshot.scope + ':' + snapshot.sequence + ':' + token, suffix: smisModuleRequestSuffix(snapshot), valid: () => token === observationEpoch.current && enabled && session.current(snapshot) });
      setCaptured(snapshot.objectName); setNotice('この時点の動きの値を用意しました。目的と必要な働きを確認して、Eveへ渡してください。'); refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : '部品の情報を確認できません。'); }
  }
  function detach() {
    session.detach(); onContext(null); setObservation(null); setCaptured(''); setNotice('この物との結び付きを外しました。Eveの停止確認が終わるまで、次の物へは実行しません。'); refresh();
  }
  return <section aria-label="付け替えて使う部品">
    <SmisObjectPurposePanel observation={observation} workAvailable={workAvailable} canChange={canChange} onContext={onContext}/>
    <h3>同じ部品を、違う物に使う</h3>
    <p>本人用の先行試作です。最初はmicro:bit V2の動きセンサーを読み、Eveの文章担当へ渡します。別の物に付け替える前に仕事を終えてください。</p>
    <button type="button" disabled={!enabled || !canChange || busy || view.connected} onClick={() => void connect()}>{busy ? '部品との接続を確認しています…' : '動きを送る部品を選ぶ'}</button>
    <button type="button" disabled={!view.connected && !busy} onClick={() => { connection.current?.abort(); session.disconnect(); onContext(null); setObservation(null); refresh(); }}>部品の接続をやめる</button>
    {notice && <output>{notice}</output>}
    {view.connected && <><label>今、付けた物の名前<input maxLength={40} value={name} disabled={!canChange} onChange={event => setName(event.target.value)} /></label>
      <p>取り付けを自動で見分ける部品はまだ使っていません。自分で固定した物の名前を確認します。動きの変化は、測定精度や物との接触の証明ではありません。</p>
      <button type="button" disabled={!enabled || !canChange || !view.fresh || !name.trim()} onClick={attach}>この物に付けました</button>
      <button type="button" disabled={!view.objectName} onClick={detach}>この物から外す・付け替える</button>
      <output>対象：{view.objectName || 'まだ確認していません'} ／ 部品の情報：{view.fresh ? '受信中' : '新しい情報を待っています'}</output>
      {view.motion && <p>部品の動きの値：X {view.motion.x} ／ Y {view.motion.y} ／ Z {view.motion.z}</p>}
      <button type="button" disabled={!enabled || !canChange || !view.fresh || !view.changed} onClick={capture}>物を動かし、値の変化を確認しました。この値を依頼に使う</button>
      {captured && <p>次の依頼に添える対象：{captured}。温度・重さ・位置・物の内容は測っていません。結果はEveの同じ成果一覧から文章で保存できます。</p>}
    </>}
    <details><summary>集める部品と、それぞれの使い道</summary><ul>
      <li>micro:bit V2を1台：物に付けた部品の動きをPixelへ送るため。単なる紛失防止タグは今回の読み取り方式とは異なります。</li>
      <li>面ファスナーや柔らかいバンド：同じ部品を違う物へ付け替え、使っている間にずれないようにするため。</li>
      <li>その基板に対応する電池ボックスと電池：ケーブルを外した状態で部品を動かすため。USB給電でも卓上の接続確認はできます。</li>
      <li>基板に合う通信用USBケーブル：動きを送る準備用プログラムを最初に基板へ入れるため。</li>
    </ul><p>準備用プログラムは、MakeCodeのBluetooth拡張で加速度サービスを開始するものです。通常のペアリングを使い、未接続のまま情報が届くとは表示しません。購入・プログラム取得・基板への書き込みは自動では行いません。</p>
      <p>この準備は物に付ける基板のためです。Pixelへ別のAIモデルを追加する準備ではありません。</p>
      <pre>bluetooth.startAccelerometerService();</pre>
      <p><a href="https://makecode.microbit.org/reference/bluetooth/start-accelerometer-service" target="_blank" rel="noreferrer">メーカー側の準備方法を見る</a></p>
      <p>取り外しを自動で見つけたい場合は、接点スイッチ等を持つ台座と、それを読むプログラムも必要です。今回の先行試作は本人の「外す」操作と通信断で停止を確認する段階です。</p>
    </details>
  </section>;
}
