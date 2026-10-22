'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import SkyDeviceAgentConnections from './sky-device-agent-connections';
import styles from './sky-device-agent-connections.module.css';
export default function SkyConnectedRuntime() {
  const [owner, setOwner] = useState(''),
    [status, setStatus] = useState<
      'loading' | 'signed_out' | 'unavailable' | 'ready'
    >('loading');
  useEffect(() => {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    let live = true;
    void fetch('/api/eve/runtime', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!live) return;
        if (response.status === 401) {
          setStatus('signed_out');
          return;
        }
        if (!response.ok) throw Error('unavailable');
        const data = (await response.json()) as { ownerUserId?: string };
        if (!live) return;
        if (!data.ownerUserId) throw Error('unavailable');
        setOwner(data.ownerUserId);
        setStatus('ready');
      })
      .catch(() => {
        if (live) setStatus('unavailable');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  return (
    <WorkspaceShell title="Sky" contentClassName={styles.content}>
      <section
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '32px clamp(18px,4vw,42px)',
        }}
      >
        <p
          style={{
            fontSize: 11,
            letterSpacing: '.14em',
            color: 'var(--os-muted)',
          }}
        >
          SKY / CONNECTED CAPABILITIES
        </p>
        <h1>接続した担当と、実行先。</h1>
        <p>
          同じアカウントの端末から、Eveで使う担当を選びます。基盤モデルと送信先を確認してから依頼できます。
        </p>
        <nav
          aria-label="接続した能力の操作"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}
        >
          <Link href="/os/eve">Eveで続きを見る</Link>
          <Link href="/connect/device">端末の追加・解除</Link>
          <Link href="/sky">Skyへ戻る</Link>
        </nav>
        {status === 'loading' && <p>接続した能力を確認しています…</p>}
        {status === 'signed_out' && (
          <p>
            <Link href="/account?returnTo=%2Fsky%2Fdevices">
              サインインして自分の担当を見る
            </Link>
          </p>
        )}
        {status === 'unavailable' && (
          <p>
            接続を確認できませんでした。通信を確認して再読み込みしてください。
          </p>
        )}
        {status === 'ready' && (
          <SkyDeviceAgentConnections key={owner} ownerUserId={owner} />
        )}
      </section>
    </WorkspaceShell>
  );
}
