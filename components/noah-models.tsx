'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import type { NoahModelReference } from '@/lib/noah-model-references';
import WorkspaceShell from './workspace-shell';
import styles from './noah-agent-catalog.module.css';

type Model = {
  id: string;
  name: string;
  digest: string;
  bytes: number;
  license: string;
  source: string;
  prepared: boolean;
  sourceAvailable: boolean;
  state: string;
  message: string;
  connections: number;
  references: NoahModelReference[];
  completed?: number;
  total?: number;
  derivedFrom?: { id: string } | null;
};
export default function NoahModels() {
  const [models, setModels] = useState<Model[]>([]),
    [scope, setScope] = useState(''),
    [error, setError] = useState(''),
    [readError, setReadError] = useState('');
  const [pending, setPending] = useState(''),
    [confirm, setConfirm] = useState(''),
    [retry, setRetry] = useState(0);
  const revision = useRef(0),
    busy = useRef(false);
  useEffect(
    () =>
      startNoahVisiblePolling(async (signal) => {
        const before = revision.current;
        try {
          const response = await fetch('/__noah/models', {
            cache: 'no-store',
            signal,
          });
          const data = (await response.json()) as {
            models?: Model[];
            ownerScope?: string;
            error?: string;
          };
          if (
            !response.ok ||
            !Array.isArray(data.models) ||
            !/^owner-v1:[a-f0-9]{64}$/.test(data.ownerScope || '')
          )
            throw new Error(data.error || 'モデル管理に接続できません。');
          if (!signal.aborted && before === revision.current && !busy.current) {
            setModels(data.models);
            setScope(data.ownerScope!);
            setReadError('');
          }
          return data.models.some((m: Model) =>
            ['preparing', 'removing'].includes(m.state),
          )
            ? 2000
            : 15000;
        } catch (e) {
          if (!signal.aborted && before === revision.current && !busy.current) {
            setModels([]);
            setScope('');
            setConfirm('');
            setReadError(
              e instanceof Error ? e.message : '接続を確認してください。',
            );
          }
        }
      }, 15000),
    [retry],
  );
  async function performModelAction(model: Model, kind: 'prepare' | 'remove') {
    if (busy.current || !scope) return;
    busy.current = true;
    revision.current++;
    setPending(model.id);
    setError('');
    try {
      const response = await fetch('/__noah/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [OWNER_SCOPE_HEADER]: scope,
        },
        body: JSON.stringify({
          action: kind,
          model: model.id,
          digest: model.digest,
          accepted: true,
        }),
      });
      const data = (await response.json()) as {
        models?: Model[];
        ownerScope?: string;
        error?: string;
      };
      if (!response.ok || data.ownerScope !== scope)
        throw new Error(
          data.error ||
            '操作の受付を確認できません。状態を再確認してください。',
        );
      setConfirm('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '操作できません。状態を再確認してください。',
      );
    } finally {
      busy.current = false;
      revision.current++;
      setPending('');
      setRetry((n) => n + 1);
    }
  }
  return (
    <WorkspaceShell title="Noah" tone="sky">
      <main className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/noah/explore">見つける</Link>
          <Link href="/noah/saved?tab=agents">自分のAgent</Link>
          <Link href="/noah/work">仕事・成果</Link>
        </nav>
        <header className={styles.hero}>
          <div>
            <h1>このMacのモデル</h1>
            <p>
              Agentの接続に必要なモデルを裏側で準備します。準備中も他の画面で作業できます。
            </p>
          </div>
        </header>
        <p>
          対応モデルとTool接続版を管理します。Agentの「接続する」からも自動で準備されます。MacとNoah・Ollamaの起動が必要です。
        </p>
        {(error || readError) && (
          <p role="alert" className={styles.error}>
            {error || readError}{' '}
            <button onClick={() => setRetry((n) => n + 1)}>状態を再確認</button>
          </p>
        )}
        {!scope && !error && !readError && <output>モデルを確認中…</output>}
        {models.map((m) => {
          const working = ['preparing', 'removing'].includes(m.state),
            blocked = working || m.connections > 0 || m.references.length > 0;
          return (
            <section key={m.id} className={styles.notice} aria-label={m.name}>
              <h2>{m.name}</h2>
              {m.derivedFrom && <p>元モデル（{m.derivedFrom.id}）の重みを再利用し、Toolとの通信形式を修正した版です。元モデルと過去の仕事はそのまま残ります。</p>}
              <p>
                {(m.bytes / 1024 ** 3).toFixed(2)} GiB · {m.license} ·{' '}
                <a href={m.source} target="_blank" rel="noopener noreferrer">
                  配布元
                </a>
              </p>
              <p aria-live="polite">
                <strong>
                  {working
                    ? '裏側で処理中'
                    : m.prepared
                      ? '利用できます'
                      : m.state === 'failed' || m.state === 'interrupted'
                        ? '再準備が必要です'
                        : '未準備'}
                </strong>{' '}
                · {m.message}
              </p>
              {working && m.total !== undefined && m.total > 0 && (
                <progress
                  aria-label="モデルの取得"
                  value={m.completed || 0}
                  max={m.total}
                />
              )}
              <p>
                {m.sourceAvailable
                  ? 'このMacの既存モデルからNoah用の参照を作ります。'
                  : '未取得の場合は上記容量のモデルを配布元から取得します。保存には追加の空き容量が必要です。'}
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  disabled={!scope || Boolean(pending) || working}
                  onClick={() => void performModelAction(m, 'prepare')}
                >
                  {m.prepared ? '準備状態を確認' : 'モデルを準備'}
                </button>
                {m.prepared && (
                  <button
                    disabled={!scope || Boolean(pending) || blocked}
                    onClick={() => setConfirm(m.id)}
                  >
                    Noah用の参照を削除
                  </button>
                )}
              </div>
              {m.connections > 0 && (
                <p>
                  接続中のAgent：{m.connections}
                  件。削除するには接続を停止してください。
                </p>
              )}
              {!!m.references.length && (
                <>
                  <p>
                    このモデルを必要とするAgent・仕事・運用があるため、削除できません。
                  </p>
                  <ul>
                    {m.references.map((r) => (
                      <li key={`${r.kind}/${r.id}`}>
                        <Link href={r.href}>{r.label}</Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {confirm === m.id && (
                <div>
                  <p>
                    Noah用のモデル参照を削除します。本人の元モデルと実行結果は残ります。データが共有されているため、表示容量分の空きが増えるとは限りません。
                  </p>
                  <button
                    disabled={Boolean(pending) || blocked}
                    onClick={() => void performModelAction(m, 'remove')}
                  >
                    削除する
                  </button>{' '}
                  <button
                    disabled={Boolean(pending)}
                    onClick={() => setConfirm('')}
                  >
                    戻る
                  </button>
                </div>
              )}
              <details>
                <summary>確認済みのモデル版</summary>
                <code className={styles.digest}>{m.digest}</code>
              </details>
            </section>
          );
        })}
      </main>
    </WorkspaceShell>
  );
}
