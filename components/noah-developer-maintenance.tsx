'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  MessageCircle,
  GitPullRequest,
  ShieldCheck,
} from 'lucide-react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { MaintenanceRequest } from '@/lib/noah-feedback';
import styles from './noah-developer-maintenance.module.css';
export default function NoahDeveloperMaintenance({
  initialAgent = '',
  operator = false,
}: {
  initialAgent?: string;
  operator?: boolean;
}) {
  const [scope, setScope] = useState<string | null>(null),
    [agent, setAgent] = useState(initialAgent),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<{ id: string; name: string }[]>([]),
    [searchError, setSearchError] = useState('');
  const [objective, setObjective] = useState(''),
    [repository, setRepository] = useState(''),
    [authorized, setAuthorized] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [auth, setAuth] = useState(false),
    [notice, setNotice] = useState(''),
    [attempt, setAttempt] = useState(0),
    [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);
  const generation = useRef(0);
  const pending = useRef<{
    id: string;
    fingerprint: string;
    scope: string | null;
  } | null>(null);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
      pending.current = null;
      setScope(null);
      setRequests(null);
      setObjective('');
      setRepository('');
      setAuthorized(false);
      setNotice('');
      setError('');
      setBusy(false);
      setAttempt((n) => n + 1);
    };
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('rockstar.community.'))
        invalidate();
    };
    window.addEventListener('rockstar-community-changed', invalidate);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('rockstar-community-changed', invalidate);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      version = generation.current;
    void fetch(
      `/api/noah/feedback?maintenance=${operator ? 'operator' : 'mine'}`,
      { signal: controller.signal, cache: 'no-store' },
    )
      .then(async (r) => {
        const d = (await r.json()) as {
          requests: MaintenanceRequest[];
          ownerScope: string;
          error?: string;
          message: string;
          id: string;
        };
        if (!r.ok) {
          if (controller.signal.aborted || version !== generation.current)
            return;
          setScope(null);
          setRequests(null);
          setAuth(r.status === 401);
          throw Error(d.error || '依頼を読み込めませんでした。');
        }
        if (!controller.signal.aborted && version === generation.current) {
          setRequests(d.requests);
          setScope(d.ownerScope);
          setError('');
          setAuth(false);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && version === generation.current)
          setError(e.message);
      });
    return () => controller.abort();
  }, [attempt, operator]);
  useEffect(() => {
    const controller = new AbortController();
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void fetch(
        `/api/noah/public-catalog?kind=agent&limit=10&q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then(async (r) => {
          const d = (await r.json()) as {
            entries: { id: string; name: string }[];
          };
          if (!r.ok) throw Error('Agentを検索できませんでした。');
          if (!controller.signal.aborted) {
            setResults(d.entries);
            setSearchError('');
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setSearchError(e.message);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  async function submit() {
    if (busy || !scope) return;
    const version = generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    const fingerprint = JSON.stringify([agent, objective, repository]);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { id: crypto.randomUUID(), fingerprint, scope };
    try {
      const r = await fetch('/api/noah/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [OWNER_SCOPE_HEADER]: pending.current?.scope ?? '',
        },
        body: JSON.stringify({
          action: 'maintenance',
          id: pending.current!.id,
          agentId: agent,
          objective,
          repository,
          authorized,
          scopeVersion: 'noah-maintenance-v1',
        }),
      });
      const d = (await r.json()) as {
        requests: MaintenanceRequest[];
        ownerScope: string;
        error?: string;
        message: string;
        id: string;
      };
      if (version !== generation.current) return;
      if (!r.ok) {
        setAuth(r.status === 401);
        throw Error(d.error || '保存できませんでした。');
      }
      setNotice(`${d.message} 受付ID: ${d.id}`);
      pending.current = null;
      setObjective('');
      setRepository('');
      setAuthorized(false);
      setAttempt((n) => n + 1);
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <nav>
        <Link href="/noah">← タイムライン</Link>
        <Link href="/noah/publisher">
          作者の管理画面 <ArrowUpRight size={14} />
        </Link>
      </nav>
      <header className={styles.hero}>
        <span>NOAH FOR DEVELOPERS</span>
        <h1>
          ユーザーの声を、
          <br />
          <em>次のアップデートへ。</em>
        </h1>
        <p>
          コメントを読み解き、改善を提案。
          <br />
          承認した変更を、検証済みのPRで届ける運用パッケージ。
        </p>
        <a href="#request">
          個別見積もりを依頼 <ArrowUpRight size={17} />
        </a>
        <small>料金・作業範囲は個別に合意。申込だけでは課金されません。</small>
      </header>
      <section className={styles.steps} aria-label="パッケージに含む作業">
        {[
          {
            Icon: MessageCircle,
            title: '声を、改善の手がかりに。',
            text: 'コメント・王冠・利用人数を読み、ユーザーの目的とつまずきを整理します。',
          },
          {
            Icon: GitPullRequest,
            title: '承認した改善を、コードへ。',
            text: '意図を確認し、必要な機能改善とリファクタリングを分離ブランチで進めます。',
          },
          {
            Icon: ShieldCheck,
            title: '動作を確かめて、届ける。',
            text: '回帰試験、変更点、未対応事項をまとめ、レビューできるPRで納品します。',
          },
        ].map(({ Icon, title, text }, i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <Icon size={23} />
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className={styles.scope}>
        <h2>変える前に、意図を合わせる。</h2>
        <p>
          どの声を採用するか、何を変えるかは開発者と決めます。リポジトリへの権限確認と見積もりの承認後に着手。納品するPRを確認し、本番への反映は開発者が判断します。
        </p>
        <div>
          <span>
            <Check size={15} />
            改善提案と優先順位
          </span>
          <span>
            <Check size={15} />
            修正・リファクタリング
          </span>
          <span>
            <Check size={15} />
            試験結果・PR納品
          </span>
        </div>
      </section>
      <section id="request" className={styles.request}>
        <span>LET’S BUILD WHAT USERS WANT</span>
        <h2>{operator ? '運営の受付一覧' : 'まずは、改善したいことから。'}</h2>
        {!operator && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label>
              対象のAgentを探す
              <input
                value={query}
                disabled={busy}
                maxLength={120}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResults([]);
                }}
                placeholder="Agent名で検索"
              />
            </label>
            {results.length > 0 && (
              <div className={styles.results}>
                {results.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    disabled={busy}
                    onClick={() => {
                      setAgent(r.id);
                      setQuery('');
                      setResults([]);
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            {searchError && <p role="alert">{searchError}</p>}
            {agent && (
              <p className={styles.selected}>
                選択中: <Link href={`/noah/feedback/${agent}`}>{agent}</Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAgent('')}
                >
                  変更
                </button>
              </p>
            )}
            <label>
              対象リポジトリのURL
              <input
                type="url"
                required
                disabled={busy}
                maxLength={300}
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                placeholder="https://github.com/your-team/your-agent"
              />
              <small>秘密鍵やアクセストークンは入力しないでください。</small>
            </label>
            <label>
              ユーザーに、どう使ってほしいですか？
              <textarea
                required
                rows={4}
                disabled={busy}
                maxLength={2000}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="改善したい体験、気になっているコメント、守りたい動作など。"
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                required
                disabled={busy}
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
              />
              <span>
                対象の開発者、または依頼する権限があります。これは見積もり依頼であり、料金・範囲・コードへの権限を確認してから着手することを確認しました。
              </span>
            </label>
            <button
              className={styles.submit}
              disabled={busy || !scope || !agent || !authorized}
            >
              {busy ? '保存中…' : '見積もり依頼を保存'}{' '}
              <ArrowUpRight size={16} />
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}{' '}
            {auth ? (
              <Link
                href={`/account?returnTo=${encodeURIComponent(`/noah/developers${agent ? `?agent=${agent}` : ''}`)}`}
              >
                本人確認へ
              </Link>
            ) : (
              <button onClick={() => setAttempt((n) => n + 1)}>
                再読み込み
              </button>
            )}
          </p>
        )}
        {notice && <output className={styles.notice}>{notice}</output>}
        {requests && (
          <div className={styles.history}>
            <h3>
              {operator ? '保存された見積もり依頼' : '自分の見積もり依頼'}
            </h3>
            {requests.length === 0 ? (
              <p>まだ依頼はありません。</p>
            ) : (
              requests.map((r) => (
                <article key={r.id}>
                  <strong>受付済み · 条件確認前</strong>
                  <p>{r.objective}</p>
                  <Link href={`/noah/feedback/${r.agentId}`}>
                    対象Agentのフィードバック
                  </Link>
                  <p>{r.repository}</p>
                  <small>
                    {new Date(r.createdAt).toLocaleDateString('ja-JP')} · {r.id}
                  </small>
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}
