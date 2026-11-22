'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import NoahIntakeReview from './noah-intake-review';
import NoahShelfReview from './noah-shelf-review';
import NoahTrialReview from './noah-trial-review';
import NoahRetentionReview from './noah-retention-review';
import { SKY_REVIEW_CHECKS } from '@/lib/sky-tool-review';
import type { SkyToolPackage } from '@/lib/sky-tool-package';
import styles from './noah-agent-catalog.module.css';
const labels: Record<string, string> = {
  sourcePinned: '配布コードの固定版',
  rights: '配布する権利',
  license: 'ライセンス',
  permissions: '必要な権限',
  privacy: 'データの扱い',
  pricing: '料金',
  sandbox: '隔離環境での動作',
  outputQuality: '成果の品質',
};
type Row = {
  packageKey: string;
  manifestSha256: string;
  status: string;
  manifest: SkyToolPackage;
};
export default function NoahReview() {
  const [rows, setRows] = useState<Row[]>([]),
    [scope, setScope] = useState(''),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Row | null>(null),
    [checks, setChecks] = useState<string[]>([]),
    [notes, setNotes] = useState(''),
    [evidence, setEvidence] = useState(''),
    [pending, setPending] = useState(false);
  async function load() {
    const r = await fetch('/api/noah/review', { cache: 'no-store' }),
      d = (await r.json()) as {
        packages: Row[];
        ownerScope: string;
        error?: string;
      };
    if (!r.ok) throw new Error(d.error ?? '審査の応答を確認できません。');
    setRows(d.packages);
    setScope(d.ownerScope);
  }
  useEffect(() => {
    const c = new AbortController();
    void fetch('/api/noah/review', { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        const d = (await r.json()) as {
          packages: Row[];
          ownerScope: string;
          error?: string;
        };
        if (!r.ok) throw new Error(d.error ?? '審査を読み込めません。');
        setRows(d.packages);
        setScope(d.ownerScope);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  async function decide(decision: string) {
    if (!selected || pending) return;
    setPending(true);
    setError('');
    try {
      const artifact = selected.manifest.source.artifact;
      if (!artifact)
        throw new Error('この審査画面は固定コード付きAgentを対象とします。');
      const r = await fetch('/api/noah/review', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Rock-Owner-Scope': scope,
          },
          body: JSON.stringify({
            packageKey: selected.packageKey,
            manifestSha256: selected.manifestSha256,
            decision,
            sourceRevision: artifact.sha256,
            sourceSha256: artifact.sha256,
            checks: Object.fromEntries(checks.map((k) => [k, true])),
            evidenceUrls: evidence
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
            notes,
            expiresAt: Date.now() + 30 * 86400000,
          }),
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? '審査の応答を確認できません。');
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '審査を保存できません。');
    } finally {
      setPending(false);
    }
  }
  return (
    <main className={styles.page}>
      <h1>Agentの審査</h1>
      {/* 定期便の台帳（task 124）。審査者だけが開ける別の画面。 */}
      {scope && <p><Link href="/noah/review/teikibin">定期便の台帳（入金・締め・払い出し）を開く</Link></p>}
      {scope && <NoahIntakeReview key={scope} ownerScope={scope} />}
      {scope && <NoahShelfReview key={`shelf:${scope}`} ownerScope={scope} />}
      {scope && <NoahTrialReview key={`trial:${scope}`} ownerScope={scope} />}
      {scope && <NoahRetentionReview key={`retention:${scope}`} ownerScope={scope} />}
      <p>
        作者とは別の審査担当者が、提出された固定版を確認します。審査の合格後に公開一覧へ載ります。
      </p>
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <button
          key={r.packageKey}
          onClick={() => {
            setSelected(r);
            setChecks([]);
            setNotes('');
            setEvidence('');
          }}
        >
          {r.manifest.name} · {r.manifest.version} ·{' '}
          {r.status === 'verified' ? '公開中' : '審査待ち'}
        </button>
      ))}
      {selected && (
        <section className={styles.notice}>
          <h2>{selected.manifest.name}</h2>
          <p>{selected.manifest.summary}</p>
          <p>
            <a
              href={`/api/noah/review?source=${encodeURIComponent(selected.packageKey)}&manifest=${selected.manifestSha256}`}
            >
              固定された配布コードをダウンロード
            </a>
          </p>
          <details>
            <summary>配布仕様・権限・固定hash</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(selected.manifest, null, 2)}
            </pre>
          </details>
          {SKY_REVIEW_CHECKS.map((k) => (
            <label key={k} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={checks.includes(k)}
                onChange={(e) =>
                  setChecks((old) =>
                    e.target.checked ? [...old, k] : old.filter((x) => x !== k),
                  )
                }
              />
              {labels[k]}
            </label>
          ))}
          <label>
            検証証拠のHTTPS URL（1行1件）
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <label>
            審査の根拠（20文字以上）
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {selected.status === 'verified' ? (
            <button
              disabled={pending || notes.length < 20}
              onClick={() => void decide('revoked')}
            >
              公開を撤回
            </button>
          ) : (
            <>
              <button
                disabled={
                  pending ||
                  checks.length !== SKY_REVIEW_CHECKS.length ||
                  notes.length < 20 ||
                  !evidence.trim()
                }
                onClick={() => void decide('verified')}
              >
                この版を承認して公開
              </button>
              <button
                disabled={pending || notes.length < 20}
                onClick={() => void decide('rejected')}
              >
                差し戻す
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
