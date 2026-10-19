'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  matchesZoomDemoCapability,
  organizeMeetingNotes,
  ZOOM_DEMO_CAPABILITY,
  ZOOM_DEMO_DISCOVERY,
} from '@/lib/sky-add-zoom-demo';
import { createSkyZoomDemoArtifact, type SkyZoomMeetingNotesArtifact } from '@/lib/sky-add-zoom-artifact';
import { matchesSkyAddHostFit, type SkyAddSurface } from '@/lib/sky-add-host-contract';
import type { ZoomLaunchPresentation } from '@/lib/sky-add-zoom-launch.server';
import { privateZoomLabPath } from '@/lib/product-domains';
import styles from './sky-add-zoom-prototype.module.css';

type HostState = 'checking' | SkyAddSurface;

const sampleNotes = "会議: 新しいSky 追加体験を検討\n決定: Zoom内から欲しい機能を探せる試作を作る\n担当: Kai — Zoomの正規接続口を調査する";

export default function SkyAddZoomPrototype({ launch }: { launch: ZoomLaunchPresentation }) {
  const [host, setHost] = useState<HostState>('checking');
  const [intent, setIntent] = useState('会議の決定事項と担当を整理したい');
  const [selected, setSelected] = useState(false);
  const [notes, setNotes] = useState(sampleNotes);
  const [result, setResult] = useState<SkyZoomMeetingNotesArtifact | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const surface: SkyAddSurface = host === 'checking' ? 'browser.preview' : host;
  const launchMatchesSurface = launch.status === 'browser-demo'
    ? host === 'browser.preview'
    : launch.status === 'verified-context'
      && (launch.contextType === 'meeting' && host === 'zoom.meeting.panel'
        || launch.contextType === 'chat' && host === 'zoom.chat.shortcut'
        || launch.contextType === 'panel' && host === 'zoom.client.panel');
  const matches = useMemo(() => launchMatchesSurface && matchesZoomDemoCapability(intent) && matchesSkyAddHostFit(
    ZOOM_DEMO_DISCOVERY,
    { surface, inputSource: 'manual.text', returnSlot: 'embedded.private' },
  ), [intent, launchMatchesSurface, surface]);

  useEffect(() => {
    let active = true;
    void import('@zoom/appssdk')
      .then(({ default: zoomSdk }) => zoomSdk.config({
        version: '0.16',
        capabilities: ['getRunningContext'],
      }))
      .then((context) => {
        if (!active) return;
        const next: SkyAddSurface = context.runningContext === 'inMeeting'
          ? 'zoom.meeting.panel'
          : context.runningContext === 'inChat'
            ? 'zoom.chat.shortcut'
            : context.runningContext === 'inMainClient'
              ? 'zoom.client.panel'
              : 'zoom.unsupported';
        setHost(next);
      })
      .catch(() => { if (active) setHost('browser.preview'); });
    return () => { active = false; };
  }, []);

  function resetIntent(value: string) {
    setIntent(value.slice(0, 240));
    setSelected(false);
    setResult(null);
  }

  function runDemo() {
    setResult(createSkyZoomDemoArtifact(organizeMeetingNotes(notes)));
    setCopyState('idle');
  }

  async function copyResult() {
    if (!result) return;
    const text = [
      "会議メモ整理（Sky 追加試作）",
      `概要: ${result.summary}`,
      ...result.decisions.map((item) => `決定: ${item}`),
      ...result.owners.map((item) => `担当: ${item}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.mark}>✦</span><div><strong>Sky Add</strong><small>Plugin Lab / Zoom</small></div></div>
        <span className={styles.host}>{launch.status === 'invalid-context' ? 'Zoom起動情報が無効' : launch.status === 'secret-unconfigured' ? 'Zoom起動検証を設定中' : launch.status === 'verified-context' ? 'Zoom起動検証済み / Sky本人未接続' : host === 'zoom.unsupported' ? 'このZoom画面は試作対象外' : host === 'browser.preview' ? 'ブラウザー試作' : 'Zoom起動未検証'}</span>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>その場で、機能を足す</p>
        <h1>Zoomで今、何をしたい？</h1>
        <p>Zoom Appを追加せずに、Skyから欲しい処理を探せます。</p>
        <label htmlFor="sky-add-intent">欲しい機能</label>
        <div className={styles.searchRow}>
          <input id="sky-add-intent" value={intent} onChange={(event) => resetIntent(event.target.value)} placeholder="例: 会議の決定事項をまとめたい" maxLength={240} />
          <button type="button" onClick={() => setSelected(matches)} disabled={!matches}>探す</button>
        </div>
      </section>

      {launch.status === 'browser-demo' && <section className={styles.devicePath}>
        <strong>Zoom Appなしの経路</strong>
        <p>製品ではSkyの端末エージェントが、本人のOS許可を得てZoom画面を読み、必要な操作を行います。このブラウザー試作は端末エージェントへ未接続です。今はメモを手入力して、結果をSky上で確認できます。</p>
        {process.env.NODE_ENV === 'development' && <p><Link href={privateZoomLabPath}>本人用Labでエージェントの作成・追加・実行・停止を試す</Link>（このPCだけで利用可能）</p>}
      </section>}

      <section className={styles.content} aria-live="polite">
        <div className={styles.sectionTitle}><h2>対応するエージェント</h2><span>試作データ</span></div>
        {matches ? <article className={styles.card}>
          <div className={styles.cardHead}><span className={styles.icon}>✳</span><div><h3>{ZOOM_DEMO_CAPABILITY.name}</h3><p>{ZOOM_DEMO_CAPABILITY.description}</p></div></div>
          <dl className={styles.details}><div><dt>読む情報</dt><dd>{ZOOM_DEMO_CAPABILITY.dataScope}</dd></div><div><dt>返すもの</dt><dd>{ZOOM_DEMO_CAPABILITY.output}</dd></div><div><dt>料金</dt><dd>{ZOOM_DEMO_CAPABILITY.price}</dd></div></dl>
          {!selected && <button className={styles.addButton} type="button" onClick={() => setSelected(true)}>試作エージェントを選ぶ</button>}
        </article> : <div className={styles.empty}>{launch.status === 'invalid-context' ? 'Zoomの起動情報を確認できません。Appを開き直してください。' : launch.status === 'secret-unconfigured' ? 'Zoom起動のサーバー検証が未設定です。' : host === 'checking' ? '表示先を確認しています。' : host !== 'browser.preview' && launch.status === 'browser-demo' ? 'Zoom起動の検証情報がありません。' : "この試作に対応エージェントはありません。"} <Link href="/sky/marketplace">Sky Marketを確認</Link></div>}

        {selected && matches && <section className={styles.work}>
          <div className={styles.sectionTitle}><h2>この場で使う</h2><span>手入力デモ</span></div>
          <p>会議メモを貼り付けると、この画面で整理結果を受け取れます。Zoomの会議データは取得しません。</p>
          <label htmlFor="sky-add-notes">会議メモ</label>
          <textarea id="sky-add-notes" value={notes} onChange={(event) => { setNotes(event.target.value.slice(0, 6000)); setResult(null); }} maxLength={6000} rows={7} />
          <button className={styles.runButton} type="button" onClick={runDemo} disabled={!notes.trim()}>整理して受け取る</button>
          {result && <div className={styles.result}>
            <h3>結果が届きました</h3>
            <p><strong>概要</strong><br />{result.summary}</p>
            <p><strong>決定事項</strong><br />{result.decisions.length ? result.decisions.join(' / ') : '明示された決定事項は見つかりませんでした。'}</p>
            <p><strong>担当</strong><br />{result.owners.length ? result.owners.join(' / ') : '明示された担当は見つかりませんでした。'}</p>
            <button type="button" onClick={() => void copyResult()}>結果をコピー</button>
            {copyState === 'copied' && <small>コピーしました</small>}
            {copyState === 'failed' && <small>コピーできませんでした</small>}
          </div>}
        </section>}
      </section>

      <footer className={styles.footer}>この画面は操作体験の試作です。Zoom起動が検証済みでもSky本人・権限・エージェント登録の確認にはなりません。端末エージェント操作、会議データ取得、Zema保存、Zoomへの書込みはまだ接続していません。</footer>
    </div>
  </main>;
}
