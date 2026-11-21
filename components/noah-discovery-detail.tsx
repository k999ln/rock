'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import type { DiscoveryMetadata } from '@/lib/noah-discovery-provider';
import styles from './noah-agent-catalog.module.css';
type Candidate = {
  id: string;
  checkedAt: number;
  currentRevision: number;
  versions: {
    revision: number;
    digest: string;
    observedAt: number;
    metadata: DiscoveryMetadata;
  }[];
};
export default function NoahDiscoveryDetail({ id }: { id: string }) {
  return <DiscoveryDetail key={id} id={id} />;
}
export function DiscoveryDetail({ id }: { id: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/noah/discovery/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = (await r.json()) as {
          candidate?: Candidate;
          error?: string;
        };
        if (!r.ok || !data.candidate)
          throw Error(data.error || '候補を確認できません。');
        if (!controller.signal.aborted) {
          setCandidate(data.candidate);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setCandidate(null);
          setError(e instanceof Error ? e.message : '候補を確認できません。');
        }
      });
    return () => controller.abort();
  }, [id, attempt]);
  const current = candidate?.versions.find(
      (v) => v.revision === candidate.currentRevision,
    ),
    m = current?.metadata;
  return (
    <WorkspaceShell title="Noah" tone="sky">
      <main className={styles.page}>
        <Link href="/noah/explore">← タイムライン</Link>
        {error && (
          <p role="alert">
            {error}{' '}
            <button onClick={() => setAttempt((n) => n + 1)}>再確認する</button>
          </p>
        )}
        {!m && !error && <p>公開候補を確認中…</p>}
        {m && current && candidate && (
          <>
            <header className={styles.hero}>
              <div>
                <p>公開ソースの候補 · 接続・審査未確認</p>
                <h1>{m.name}</h1>
                <p>
                  {m.summary ||
                    '提供元に説明がありません。公開資料で確認してください。'}
                </p>
              </div>
            </header>
            <section className={styles.notice}>
              <h2>確認した内容</h2>
              <dl>
                <dt>提供元</dt>
                <dd>
                  {m.author} · {m.provider}
                </dd>
                <dt>ライセンス</dt>
                <dd>
                  {m.license || '未確認。提供元の条件を確認してください。'}
                </dd>
                <dt>固定commit</dt>
                <dd style={{ overflowWrap: 'anywhere' }}>
                  {m.commit || '未確認。固定したコードの取込はまだできません。'}
                </dd>
                <dt>言語・形式</dt>
                <dd>
                  {[m.language, m.sdk].filter(Boolean).join(' / ') || '未確認'}
                </dd>
                <dt>最終公開確認</dt>
                <dd>{new Date(candidate.checkedAt).toLocaleString('ja-JP')}</dd>
              </dl>
              <p>
                この紹介情報だけでは、Agent本体かどうか、必要な契約・モデル・実行先、端末での動作は保証できません。
              </p>
              <a href={m.url} target="_blank" rel="noreferrer noopener">
                提供元の公開資料を見る
              </a>
              {m.commit && (
                <p>
                  <Link
                    href={`/noah/agents/new?sourceUrl=${encodeURIComponent(m.url)}&revision=${m.commit}`}
                  >
                    この固定版を登録画面へ渡す
                  </Link>
                </p>
              )}
              <p>
                コード取得前に保存・利用の権利を確認します。取込・自動リファクタ・動作検証・本人用登録は、次の画面で行います。
              </p>
            </section>
            <section className={styles.notice}>
              <h2>確認した版の履歴</h2>
              {candidate.versions.map((v) => (
                <p key={v.revision}>
                  確認版 {v.revision} ·{' '}
                  {new Date(v.observedAt).toLocaleString('ja-JP')} ·{' '}
                  {v.metadata.commit?.slice(0, 12) || 'commit未確認'}
                </p>
              ))}
              <p>
                提供元で公開が取り下げられたことを確認すると、この候補を表示しません。既に保存したコードの遠隔消去は約束しません。
              </p>
            </section>
          </>
        )}
      </main>
    </WorkspaceShell>
  );
}
