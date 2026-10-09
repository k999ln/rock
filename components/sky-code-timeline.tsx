'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Code2,
  GitCommitHorizontal,
  ShieldCheck,
  ShieldOff,
  Plus,
  X,
} from 'lucide-react';
import {
  CODE_PROTECTORS,
  codeDiff,
  type CodeDraft,
  type CodeSummary,
  type CodeDetail,
  type CodeCommit,
  type CodeInspection,
  type CodeProtector,
} from '@/lib/sky-code';
import { ExecutionSignin, useExecutionAccess } from './execution-access';
import styles from './sky-code-timeline.module.css';

class CodeRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public inspection?: CodeInspection,
  ) {
    super(message);
  }
}
async function request<T>(
  query = '',
  method = 'GET',
  value?: unknown,
): Promise<T> {
  const response = await fetch(`/api/sky/code${query}`, {
    method,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    ...(value === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        }),
  });
  if (response.type === 'opaqueredirect')
    throw new CodeRequestError('サインインを確認してください。', 401);
  const data = (await response.json()) as T & {
    error?: string;
    inspection?: CodeInspection;
  };
  if (!response.ok)
    throw new CodeRequestError(
      data.error || 'コードを確認できませんでした。',
      response.status,
      data.inspection,
    );
  return data;
}
function draftFrom(
  commit?: CodeCommit,
  update = false,
  repoRevision = 0,
): CodeDraft {
  return {
    id: crypto.randomUUID(),
    repoId: update && commit ? commit.repoId : crypto.randomUUID(),
    expectedRevision: update ? repoRevision : 0,
    title: commit?.title || '',
    author: commit?.author || '',
    description: commit?.description || '',
    message: update ? '' : '最初のコミット',
    license: commit?.license || 'MIT',
    files: commit
      ? commit.files.map((f) => ({ ...f }))
      : [{ path: 'agent.js', source: '' }],
    protector: update && commit ? commit.inspection.provider : 'spider',
    publishConfirmed: true,
    protectionChangeConfirmed: false,
  };
}
function badge(inspection: CodeSummary['inspection']) {
  return inspection.status === 'disabled'
    ? '検査なし'
    : `${inspection.label} · 指摘なし`;
}
export default function SkyCodeTimeline({
  initialRepoId,
  initialRevision,
}: {
  initialRepoId?: string;
  initialRevision?: number;
}) {
  const [commits, setCommits] = useState<CodeSummary[]>([]),
    [providers, setProviders] = useState<CodeProtector[]>(CODE_PROTECTORS);
  const [mine, setMine] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<CodeDetail | null>(null),
    [draft, setDraft] = useState<CodeDraft | null>(null);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [inspection, setInspection] = useState<CodeInspection | null>(null),
    [diff, setDiff] = useState(false);
  const [originalProtector, setOriginalProtector] = useState('spider');
  const feedVersion = useRef(0);
  const version = useRef(0),
    alive = useRef(true);
  const access = useExecutionAccess();
  useEffect(() => {
    const active = alive;
    const current = version;
    active.current = true;
    return () => {
      active.current = false;
      current.current++;
    };
  }, []);
  const load = useCallback(async () => {
    const current = ++feedVersion.current;
    setLoading(true);
    setError('');
    try {
      const result = await request<{
        commits: CodeSummary[];
        providers: CodeProtector[];
      }>(mine ? '?mine=1' : '');
      if (alive.current && current === feedVersion.current) {
        setCommits(result.commits);
        setProviders(result.providers);
      }
    } catch (e) {
      if (alive.current && current === feedVersion.current)
        setError(
          e instanceof Error ? e.message : 'コードを読み込めませんでした。',
        );
    } finally {
      if (alive.current && current === feedVersion.current) setLoading(false);
    }
  }, [mine]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  const open = useCallback(async (repoId: string, revision?: number) => {
    const current = ++version.current;
    setError('');
    setLoading(false);
    try {
      const value = await request<CodeDetail>(
        `?repo=${repoId}${revision ? `&revision=${revision}` : ''}`,
      );
      if (alive.current && current === version.current) {
        setDetail(value);
        setDraft(null);
        setInspection(null);
      }
    } catch (e) {
      if (alive.current && current === version.current)
        setError(e instanceof Error ? e.message : 'コードを開けませんでした。');
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && initialRepoId)
        void open(initialRepoId, initialRevision);
    });
    return () => {
      cancelled = true;
    };
  }, [initialRepoId, initialRevision, open]);
  function compose(commit?: CodeCommit, update = false) {
    version.current++;

    setDraft(draftFrom(commit, update, detail?.repoRevision));
    setOriginalProtector(
      update && commit ? commit.inspection.provider : 'spider',
    );
    setConfirmed(false);
    setInspection(null);
    setError('');
    setNotice('');
    setUncertain(false);
  }
  function edit(change: Partial<CodeDraft>) {
    setDraft((current) =>
      current ? { ...current, ...change, id: crypto.randomUUID() } : current,
    );
    setInspection(null);
    setConfirmed(false);
  }
  async function publish() {
    if (!draft || !confirmed || busy) return;
    setBusy(true);
    setError('');
    setInspection(null);
    try {
      const result = await request<{ commit: CodeCommit }>('', 'POST', {
        ...draft,
        publishConfirmed: confirmed,
      });
      if (!alive.current) return;
      setDraft(null);
      setUncertain(false);
      setNotice('コードをタイムラインへ公開しました。');
      await load();
      await open(result.commit.repoId);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof CodeRequestError) {
        setInspection(e.inspection ?? null);
        setError(e.message);
        if (e.status === 401) access.setNeedsSignin(true);
        setUncertain(e.status >= 500);
      } else {
        setUncertain(true);
        setError(
          '公開の応答を確認できません。入力を保ったまま、公開履歴と照合してください。',
        );
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await request<CodeDetail>(`?repo=${draft.repoId}`);
      if (result.history.some((c) => c.id === draft.id)) {
        setDraft(null);
        setDetail(result);
        setNotice('このコミットの保存を確認しました。');
        await load();
      } else
        setNotice(
          'このコミットはまだ履歴にありません。同じ内容・IDで再試行できます。',
        );
      setUncertain(false);
      setError('');
    } catch (e) {
      if (e instanceof CodeRequestError && e.status === 404) {
        setUncertain(false);
        setError('');
        setNotice('保存は確認できません。同じ内容・IDで再試行できます。');
      } else
        setError(
          '履歴を確認できませんでした。通信が戻ってから再照合してください。',
        );
    } finally {
      setBusy(false);
    }
  }
  async function hide() {
    if (!detail) return;
    setBusy(true);
    setError('');
    try {
      await request('', 'PATCH', {
        action: 'hide',
        repoId: detail.commit.repoId,
        expectedRevision: detail.repoRevision,
      });
      setNotice(
        'コードと全履歴を非公開にしました。取得済みの複製は回収されません。',
      );
      await load();
      await open(detail.commit.repoId);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '非公開への変更を確認できません。履歴を読み直してください。',
      );
    } finally {
      setBusy(false);
    }
  }
  function download(commit: CodeCommit) {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ schema: 'sky-code-export/1', commit }, null, 2)],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `sky-code-${commit.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const changeProtection = Boolean(
    draft &&
    (draft.protector !== originalProtector || draft.protector === 'none'),
  );
  return (
    <section
      className={styles.root}
      aria-label="エージェントコードのタイムライン"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>BUILD IN THE OPEN</span>
          <h2>
            <Code2 size={21} />
            エージェントコード
          </h2>
          <p>コードを公開。更新をコミット。作り方を共有する。</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          disabled={busy || uncertain}
          onClick={() => compose()}
        >
          <Plus size={16} />
          コードを公開
        </button>
      </header>
      <div className={styles.toolbar}>
        <span>
          <ShieldCheck size={15} />
          標準の保護は SPIDER
        </span>
        <button
          type="button"
          disabled={busy || uncertain}
          onClick={() => {
            setMine(!mine);
            setDetail(null);
          }}
        >
          {mine ? 'みんなのコードを見る' : '自分のコードを見る'}
        </button>
        <button type="button" disabled={busy} onClick={() => void load()}>
          再読み込み
        </button>
      </div>
      <p className={styles.hint}>
        公開コードの閲覧・履歴用です。検査は限定的な静的チェックで、安全保証や実行許可ではありません。
      </p>
      {notice && <output className={styles.notice}>{notice}</output>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {draft && (
        <form
          className={styles.editor}
          onSubmit={(e) => {
            e.preventDefault();
            void publish();
          }}
        >
          <div className={styles.header}>
            <h3>
              {draft.expectedRevision ? '変更をコミット' : '新しいコード'}
            </h3>
            <button
              type="button"
              aria-label="コード編集を閉じる"
              disabled={busy || uncertain}
              onClick={() => setDraft(null)}
            >
              <X size={18} />
            </button>
          </div>
          <ExecutionSignin state={access.accessState} />
          <fieldset disabled={busy || uncertain}>
            <div className={styles.fields}>
              <label>
                コード名
                <input
                  required
                  maxLength={80}
                  value={draft.title}
                  onChange={(e) => edit({ title: e.target.value })}
                />
              </label>
              <label>
                公開する作者名
                <input
                  required
                  maxLength={60}
                  value={draft.author}
                  onChange={(e) => edit({ author: e.target.value })}
                />
              </label>
            </div>
            <label>
              何をするエージェント？
              <input
                required
                maxLength={240}
                value={draft.description}
                onChange={(e) => edit({ description: e.target.value })}
              />
            </label>
            <label>
              ライセンス
              <input
                required
                maxLength={80}
                value={draft.license}
                onChange={(e) => edit({ license: e.target.value })}
              />
            </label>
            {draft.files.map((file, index) => (
              <div className={styles.fileEditor} key={index}>
                <label>
                  ファイル名 {index + 1}
                  <input
                    required
                    maxLength={120}
                    value={file.path}
                    onChange={(e) =>
                      edit({
                        files: draft.files.map((f, i) =>
                          i === index ? { ...f, path: e.target.value } : f,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  コード {index + 1}
                  <textarea
                    spellCheck={false}
                    rows={10}
                    value={file.source}
                    onChange={(e) =>
                      edit({
                        files: draft.files.map((f, i) =>
                          i === index ? { ...f, source: e.target.value } : f,
                        ),
                      })
                    }
                  />
                </label>
                {draft.files.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      edit({ files: draft.files.filter((_, i) => i !== index) })
                    }
                  >
                    このファイルを外す
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              disabled={draft.files.length >= 8}
              onClick={() =>
                edit({
                  files: [
                    ...draft.files,
                    { path: `file-${draft.files.length + 1}.js`, source: '' },
                  ],
                })
              }
            >
              ＋ ファイルを追加
            </button>
            <p className={styles.hint}>
              最大8ファイル・合計64 KiB・各2,000行。JS / TS / Python / JSON /
              Markdown / txt。
            </p>
            <label>
              変更メッセージ
              <input
                required
                maxLength={200}
                value={draft.message}
                onChange={(e) => edit({ message: e.target.value })}
              />
            </label>
            <div className={styles.protection}>
              <label>
                公開前の保護
                <select
                  value={draft.protector}
                  onChange={(e) =>
                    edit({
                      protector: e.target.value,
                      protectionChangeConfirmed: false,
                    })
                  }
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <p>{providers.find((p) => p.id === draft.protector)?.scope}</p>
              <p className={styles.hint}>
                SPIDERとSecret
                CheckはSky内の検査器です。外部AIへコードを送りません。
              </p>
              {changeProtection && (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={draft.protectionChangeConfirmed}
                    onChange={(e) =>
                      edit({ protectionChangeConfirmed: e.target.checked })
                    }
                  />
                  {draft.protector === 'none'
                    ? '自動検査を外して公開する'
                    : '検査器の変更と検査範囲を確認した'}
                </label>
              )}
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              公開権限とライセンスを確認し、このコード全文と履歴を一般公開する。秘密情報を含めない。
            </label>
            <button
              className={styles.primary}
              disabled={
                !confirmed ||
                access.executionBlocked ||
                (changeProtection && !draft.protectionChangeConfirmed)
              }
            >
              {busy
                ? '確認中…'
                : draft.protector === 'none'
                  ? '検査なしで公開'
                  : '検査して公開'}
            </button>
          </fieldset>
          {uncertain && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void reconcile()}
            >
              公開履歴と照合
            </button>
          )}
          {inspection && (
            <output className={styles.error}>
              <strong>公開前の検査で停止しました</strong>
              <ul>
                {inspection.findings.map((f, i) => (
                  <li key={i}>
                    {f.path}
                    {f.line ? `:${f.line}` : ''} — {f.title}
                  </li>
                ))}
              </ul>
              <p>
                コードは公開されていません。修正後にもう一度検査してください。
              </p>
            </output>
          )}
        </form>
      )}
      {detail && !draft && (
        <article className={styles.detail}>
          <div className={styles.header}>
            <div>
              <span className={styles.eyebrow}>
                COMMIT {detail.commit.id.slice(0, 8)} · v
                {detail.commit.revision}
              </span>
              <h3>{detail.commit.title}</h3>
            </div>
            <button
              type="button"
              aria-label="コード詳細を閉じる"
              disabled={busy}
              onClick={() => setDetail(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p>{detail.commit.description}</p>
          <p className={styles.hint}>
            {detail.commit.author} · {detail.commit.license} ·{' '}
            {detail.hidden ? '非公開' : '公開'}
          </p>
          <p className={styles.badge}>
            {detail.commit.inspection.status === 'disabled' ? (
              <ShieldOff size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}{' '}
            {badge(detail.commit.inspection)}
          </p>
          <p className={styles.hint}>
            {detail.commit.inspection.scope} · 検査器 v
            {detail.commit.inspection.version}
          </p>
          <label>
            更新履歴
            <select
              value={detail.commit.revision}
              disabled={busy}
              onChange={(e) =>
                void open(detail.commit.repoId, Number(e.target.value))
              }
            >
              {detail.history.map((c) => (
                <option key={c.id} value={c.revision}>
                  v{c.revision} · {c.message} · {c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={() => setDiff(!diff)}>
              {diff ? 'コード全文を見る' : '親コミットとの差分を見る'}
            </button>
            <button type="button" onClick={() => download(detail.commit)}>
              コードを保存
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => compose(detail.commit)}
            >
              この版から複製
            </button>
            {detail.canEdit && detail.commit.id === detail.history[0]?.id && (
              <button
                type="button"
                disabled={busy}
                onClick={() => compose(detail.commit, true)}
              >
                {detail.hidden ? '更新して再公開' : '変更をコミット'}
              </button>
            )}
            {detail.canEdit && !detail.hidden && (
              <button type="button" disabled={busy} onClick={() => void hide()}>
                全履歴を非公開にする
              </button>
            )}
          </div>
          <p>
            <GitCommitHorizontal size={16} /> {detail.commit.message}
          </p>
          {[
            ...new Set([
              ...detail.commit.files.map((f) => f.path),
              ...(diff ? (detail.parent?.files.map((f) => f.path) ?? []) : []),
            ]),
          ].map((path) => {
            const file = detail.commit.files.find((f) => f.path === path),
              before = detail.parent?.files.find((f) => f.path === path);
            return (
              <div className={styles.codeFile} key={path}>
                <h4>
                  {path}
                  {!file ? '（削除）' : !before ? '（追加）' : ''}
                </h4>
                <pre>
                  <code>
                    {diff
                      ? codeDiff(before?.source ?? '', file?.source ?? '').map(
                          (line, i) => (
                            <span className={styles[line.kind]} key={i}>
                              {line.kind === 'added'
                                ? '+'
                                : line.kind === 'removed'
                                  ? '-'
                                  : ' '}{' '}
                              {line.text}
                              {'\n'}
                            </span>
                          ),
                        )
                      : file?.source}
                  </code>
                </pre>
              </div>
            );
          })}
          <Link
            href={`/sky/code/${detail.commit.repoId}?revision=${detail.commit.revision}`}
          >
            この版の共有リンク
          </Link>
          <p className={styles.hash}>
            内容 SHA-256: {detail.commit.sourceSha256}
          </p>
        </article>
      )}
      {loading && <output>コードの履歴を読み込んでいます…</output>}
      {!loading && !commits.length && !error && (
        <p className={styles.empty}>
          {mine
            ? '公開したコードはまだありません。'
            : '最初のエージェントコードを公開しましょう。'}
          <br />
          作ったコードを、更新履歴と一緒にここへ。
        </p>
      )}
      <div className={styles.feed}>
        {commits.map((c) => (
          <article className={styles.card} key={c.repoId}>
            <div className={styles.commitIcon}>
              <GitCommitHorizontal size={20} />
            </div>
            <div>
              <span className={styles.eyebrow}>
                {c.author} · v{c.revision}
                {c.hidden ? ' · 非公開' : ''}
              </span>
              <h3>
                <button
                  type="button"
                  disabled={busy || uncertain}
                  onClick={() => void open(c.repoId)}
                >
                  {c.title}
                </button>
              </h3>
              <p>{c.description}</p>
              <p className={styles.hint}>
                {c.message} · {c.paths.length} files · {c.license}
              </p>
              <span className={styles.badge}>
                {c.inspection.status === 'disabled' ? (
                  <ShieldOff size={14} />
                ) : (
                  <ShieldCheck size={14} />
                )}{' '}
                {badge(c.inspection)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
