'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Copy, PlugZap } from 'lucide-react';
import styles from './sky-codex-bridge-panel.module.css';

type BridgeStatus = { status: 'published'; tools: Array<{ name: string; title: string; description: string }> };

const samplePrompt = 'Skyの sky_route_request を使って「出典を整理したい」を振り分けて、候補とまだ実行していないことを教えて。';

export default function SkyCodexBridgePanel() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const check = async () => {
      try {
        const response = await fetch('/api/sky/codex-bridge', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('status unavailable');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'published' ||
            !('tools' in data) || !Array.isArray(data.tools)) throw new Error('invalid status');
        setStatus(data as BridgeStatus);
        setFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        attempts += 1;
        if (attempts < 5) timer = setTimeout(() => void check(), attempts * 2_000);
        else setFailed(true);
      }
    };
    void check();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, []);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(samplePrompt);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return <details className={styles.panel} aria-label="CodexからSkyを使う">
    <summary className={styles.topline}><span><PlugZap size={14} /> CodexからSkyを使う</span><span className={styles.status} role="status" aria-live="polite">{failed ? 'Sky側を確認できません' : status ? `Sky側に${status.tools.length}機能を公開中` : 'Sky側を確認中…'}</span></summary>
    <div className={styles.body}>
      <div className={styles.copy}>
        <h2 id="sky-codex-bridge-title">Skyの道具を、会話から使う。</h2>
        <p>Skyがツールの土台。CodexからSkyに「探す・整理する・チェックする」を頼めます。結果はCodexの会話へ返ります。</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => void copyPrompt()}><Copy size={16} /> {copied ? '試す文をコピーしました' : 'Codexで試す文をコピー'} {copied && <Check size={15} />}</button>
          <Link href="/chat">Skyのチャットを開く <ArrowUpRight size={15} /></Link>
        </div>
        <div className={styles.example}><span>Codexに入力する文</span><p>{samplePrompt}</p></div>
        {copyFailed && <p className={styles.copyError} role="status">コピーできませんでした。上の文を選択してコピーしてください。</p>}
      </div>
      <div className={styles.capabilities} aria-label="Codexから呼べるSkyの機能">
        <span>いま呼べる範囲</span>
        <ul>
          <li>ツールを探す・依頼を振り分ける</li>
          <li>出典リンクを整理する</li>
          <li>提案文を事前チェックする</li>
          <li>記事の無料版を作る</li>
        </ul>
        <small>投稿・購入・有料AI・PC操作は開放していません。</small>
      </div>
    </div>
    <p className={styles.boundary}>Codex側で使えるかは、Codexの「Sky」プラグインのツール一覧で確認してください。このページにはCodexの接続状態を読む権限はありません。下に出る「MCP 0機能」はこのPCに接続したツールの数で、Sky Bridgeとは別です。</p>
  </details>;
}
