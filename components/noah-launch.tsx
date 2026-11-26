'use client';
import { noahSignInHref } from '@/lib/noah-navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import styles from './noah-agent-catalog.module.css';
type Agent = {
  id: string;
  name: string;
  summary: string;
  version: string;
  model: string;
  kind: string;
};
type Command = {
  id: string;
  deviceId: string;
  kind: string;
  state: string;
  stopRequested: boolean;
  currentBoot?: boolean;
  agent: { agentId: string; name: string };
  result?: { message?: string; workId?: string };
};
type State = {
  canReview?: boolean;
  ownerScope: string;
  devices?: { id: string; name: string; online: boolean; revoked: boolean }[];
  commands: Command[];
  uploadedAgents?: (Agent & { ready: boolean })[];
  jobs: {
    id: string;
    noahExecution?: {
      state: string;
      result?: { text: string; files: { name: string; base64: string }[] };
      error?: string;
    };
  }[];
};
const status: Record<string, string> = {
  queued: 'Macの受付待ち',
  claimed: '処理中',
  succeeded: '完了',
  failed: '失敗',
  cancelled: '停止済み',
  unknown: '結果不明・再実行なし',
};
/** `phoneWork`: スマホから、接続した Agent（相手のサーバー）へ頼んだ仕事の一覧（頁が渡す。無い人には何も出ない。docs/noah/spec-87-tool-agent.md の 11.9）。 */
export default function NoahLaunch({
  phoneWork,
  workId,
  engineeringAgentId,
  expectedOwnerScope,
}: { phoneWork?: ReactNode; workId?: string; engineeringAgentId?: string; expectedOwnerScope?: string } = {}) {
  const params = useSearchParams(),
    [compose, setCompose] = useState(
      Boolean(engineeringAgentId || params.get('agent')) || params.get('compose') === '1',
    ),
    [agents, setAgents] = useState<Agent[]>([]),
    [state, setState] = useState<State | null>(null),
    [error, setError] = useState(''),
    [readError, setReadError] = useState(''),
    [signedOut, setSignedOut] = useState(false),
    [device, setDevice] = useState(''),
    [selected, setSelected] = useState(engineeringAgentId ?? params.get('agent') ?? ''),
    [prompt, setPrompt] = useState(''),
    [consent, setConsent] = useState(false),
    [pending, setPending] = useState(false),
    [retry, setRetry] = useState<{
      action: string;
      body: Record<string, unknown>;
      scope: string;
    } | null>(null),
    [notice, setNotice] = useState('');
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const url = workId
        ? '/api/noah/launch?work=' + encodeURIComponent(workId)
        : '/api/noah/launch';
      const r = await fetch(url, { signal, cache: 'no-store' }),
        d = (await r.json()) as State & { error?: string };
      if (signal?.aborted) return;
      if (r.status === 401) {
        setSignedOut(true);
        setReadError('');
        setState(null);
        return;
      }
      if (!r.ok) throw new Error(d.error ?? 'Noahの応答を確認できません。');
      if (expectedOwnerScope && d.ownerScope !== expectedOwnerScope) {
        setState(null);
        setRetry(null);
        setReadError('アカウントが変わりました。Agentを選び直してください。');
        return;
      }
      setReadError('');
      setState(d);
      setRetry((old) =>
        old &&
        (old.scope !== d.ownerScope ||
          d.commands.some((c) => c.id === old.body.id))
          ? null
          : old,
      );
      setSignedOut(false);
      setDevice(
        (old) =>
          old ||
          d.devices?.find((v: { online: boolean }) => v.online)?.id ||
          '',
      );
    },
    [workId, expectedOwnerScope],
  );
  useEffect(() => {
    const c = new AbortController();
    if (!workId && !engineeringAgentId)
      void fetch('/api/noah/launch?public=1', { signal: c.signal })
        .then(async (r) => {
          const d = (await r.json()) as { agents: Agent[]; error?: string };
          if (!r.ok) throw new Error(d.error ?? 'Noahの応答を確認できません。');
          setAgents(d.agents);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        });
    let busy = false;
    const tick = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        await refresh(c.signal);
      } catch (e) {
        if (!c.signal.aborted) {
          setState(null);
          setReadError(e instanceof Error ? e.message : '読込失敗');
        }
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 3000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      c.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [workId, refresh, engineeringAgentId]);
  async function act(action: string, body: Record<string, unknown>) {
    if (!state || pending) return;
    setPending(true);
    setError('');
    setNotice('');
    let accepted = false,
      rejected = false;
    try {
      const r = await fetch('/api/noah/launch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Rock-Owner-Scope': state.ownerScope,
          },
          body: JSON.stringify({ action, ...body }),
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) {
        rejected = r.status < 500;
        throw new Error(d.error ?? 'Noahの応答を確認できません。');
      }
      accepted = true;
      if (action === 'run' && !engineeringAgentId) setCompose(false);
      setRetry(null);
      setNotice(
        action === 'stop'
          ? '停止要求を受け付けました。終了結果は下の履歴で確認できます。'
          : action === 'connect'
            ? '接続要求を受け付けました。進捗と結果は下の履歴に表示します。画面を閉じても処理は続きます。'
            : action === 'revoke'
              ? 'このMacの接続を解除しました。'
              : '依頼を受け付けました。',
      );
      await refresh();
    } catch (e) {
      if (!accepted && !rejected && ['connect', 'run'].includes(action))
        setRetry({ action, body, scope: state.ownerScope });
      if (rejected) setRetry(null);
      setError(e instanceof Error ? e.message : '操作を完了できません。');
    } finally {
      setPending(false);
    }
  }
  const available = [
      ...(state?.uploadedAgents?.filter((a) => a.ready) ?? []),
      ...agents,
    ],
    chosen = available.find((a) => a.id === selected),
    connection = state?.commands.find(
      (c) =>
        c.kind === 'connect' &&
        c.agent.agentId === selected &&
        c.deviceId === device &&
        c.state === 'succeeded' &&
        c.currentBoot &&
        !c.stopRequested,
    ),
    online = state?.devices?.some(
      (d) => d.id === device && d.online && !d.revoked,
    );
  const returnTo = engineeringAgentId ? `/noah/engineering?step=test&agent=${encodeURIComponent(engineeringAgentId)}` : workId
    ? `/noah/work/${encodeURIComponent(workId)}`
    : selected
      ? `/noah/activity?agent=${encodeURIComponent(selected)}#library`
      : '/noah/activity';
  const macHref = `/noah/devices${selected ? `?agent=${encodeURIComponent(selected)}` : ''}#mac`;
  const Container = engineeringAgentId ? 'section' : 'main';
  const commands = engineeringAgentId ? state?.commands.filter(c => c.agent.agentId === engineeringAgentId) : state?.commands;
  return (
    <Container className={engineeringAgentId ? undefined : styles.page}>
      {!engineeringAgentId && <><header className={styles.hero}>
        <div>
          <h1>{workId ? '仕事の詳細' : '実行中のAgent'}</h1>
        </div>
      </header>
      <nav className={styles.nav}>
        {workId ? (
          <Link href="/noah/activity#work">仕事の一覧へ</Link>
        ) : (
          <button
            className={styles.primary}
            aria-expanded={compose}
            aria-controls="library"
            onClick={() => setCompose(!compose)}
          >
            {compose ? '依頼入力を閉じる' : '仕事を頼む'}
          </button>
        )}
        <Link href="/noah/explore">Agentを探す</Link>
        <Link href="/noah/data">保存した成果</Link>
      </nav></>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {readError && (
        <p role="alert" className={styles.error}>
          接続情報を読み込めませんでした。{readError}
          <button
            onClick={() =>
              void refresh().catch((e) => {
                setState(null);
                setReadError(e instanceof Error ? e.message : '読込失敗');
              })
            }
          >
            接続情報を再読み込み
          </button>
        </p>
      )}
      {!state && !signedOut && !readError && (
        <output>接続情報を読み込んでいます…</output>
      )}
      {notice && <output>{notice}</output>}
      {retry && (
        <section className={styles.notice}>
          <p>
            受付結果を確認できません。新しい依頼を作らず、同じ操作番号で確認します。
          </p>
          <button
            disabled={pending}
            onClick={() => void act(retry.action, retry.body)}
          >
            同じ操作の受付を確認
          </button>
        </section>
      )}
      {signedOut && (
        <section className={styles.notice}>
          <p>自分のAgentとMacを管理するにはサインインしてください。</p>
          <a
            href={noahSignInHref(returnTo)}
          >
            サインイン
          </a>
        </section>
      )}
      {!workId && compose && (
        <section className={styles.notice} id="library">
          {!engineeringAgentId && <><h2>1. Agentを選ぶ</h2>
          <details>
            <summary>Agentを作る・公開する</summary>
            <nav className={styles.nav}>
              <Link href="/noah/agents/new?launch=1">自分のAgentを登録</Link>
              <Link href="/noah/publisher">掲載・公開を管理</Link>
              {state?.canReview && <Link href="/noah/review">審査</Link>}
            </nav>
          </details>
          <details>
            <summary>自分で登録したAgent</summary>
            {state && !state.uploadedAgents?.length && (
              <p>まだ登録していません。</p>
            )}
            {state?.uploadedAgents?.map((a) => (
              <p key={a.id}>
                <Link href={'/noah/agents/' + a.id}>
                  {a.name} · {a.version}
                </Link>
                {' · '}
                {a.ready
                  ? '接続先のMacで実行できます'
                  : '詳細で接続条件を確認してください'}
              </p>
            ))}
          </details>
          <label>
            Agentを選ぶ
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setConsent(false);
              }}
            >
              <option value="">Agentを選択</option>
              {selected && !chosen && (
                <option value={selected}>選択した自分のAgent</option>
              )}
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ·{' '}
                  {a.kind === 'release'
                    ? '審査済み公開版'
                    : a.kind === 'upload'
                      ? '自分のAgent'
                      : '対応済みの限定実行'}
                </option>
              ))}
            </select>
          </label>
          </>}
          {engineeringAgentId && state && !chosen && <p>この登録版には実行できる設定がありません。コードと実行設定を確認してください。</p>}
          {chosen && !engineeringAgentId && (
            <>
              <h3>{chosen.name}</h3>
              <details className={styles.agentDetails}>
                <summary>できること・利用条件</summary>
                <dl>
                  <div>
                    <dt>できること</dt>
                    <dd>{chosen.summary}</dd>
                  </div>
                  <div>
                    <dt>実行先</dt>
                    <dd>
                      {chosen.model === 'codex-account'
                        ? '本人のCodexの利用枠を使用'
                        : '本人Macのローカル処理'}
                    </dd>
                  </div>
                  <div>
                    <dt>バージョン</dt>
                    <dd>{chosen.version}</dd>
                  </div>
                </dl>
              </details>
            </>
          )}
          <div className={styles.notice}>
            <h2>{engineeringAgentId ? '試すMacを選ぶ' : '2. Macをつなぐ'}</h2>
            {state && (
              <>
                <label>
                  使うMac
                  <select
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                  >
                    <option value="">Macを選択</option>
                    {state.devices
                      ?.filter((d) => !d.revoked)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.online ? '接続中' : 'オフライン'}
                        </option>
                      ))}
                  </select>
                </label>
                {!online && (
                  <p>
                    Macが未接続です。
                    <Link className={styles.primary} href={macHref}>
                      Macをつなぐ
                    </Link>
                  </p>
                )}
                {device && !engineeringAgentId && (
                  <button
                    disabled={pending}
                    onClick={() => void act('revoke', { id: device })}
                  >
                    このMacの接続を解除
                  </button>
                )}
              </>
            )}
            <p>画面を操作せず、Macの専用環境で動きます。</p>
          </div>
          {!selected && <p>Agentを選んでください。</p>}
          <button
            disabled={
              !state || !selected || !online || pending || Boolean(retry) || Boolean(engineeringAgentId && !chosen)
            }
            onClick={() =>
              void act('connect', {
                id: crypto.randomUUID(),
                deviceId: device,
                agentId: selected,
              })
            }
          >
            {connection ? '接続し直す' : 'このAgentをつなぐ'}
          </button>
          {connection && (!engineeringAgentId || chosen) && (
            <div>
              <h2>{engineeringAgentId ? '試したい入力' : '3. 仕事を頼む'}</h2>
              <label>
                依頼する仕事
                <textarea
                  rows={5}
                  maxLength={12000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="作ってほしい成果を具体的に入力してください"
                />
              </label>
              {chosen?.model === 'codex-account' && (
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  この依頼を本人のCodexへ送り、利用枠を使います
                </label>
              )}
              <button
                disabled={
                  pending ||
                  Boolean(retry) ||
                  !online ||
                  !prompt.trim() ||
                  (chosen?.model === 'codex-account' && !consent)
                }
                onClick={() =>
                  void act('run', {
                    id: crypto.randomUUID(),
                    deviceId: device,
                    connectionId: connection.id,
                    prompt,
                    ...(consent ? { consent: 'codex-account/1' } : {}),
                  })
                }
              >
                {engineeringAgentId ? 'この入力で試す' : 'この内容で実行'}
              </button>
            </div>
          )}
        </section>
      )}
      {!workId && !engineeringAgentId && state && (
        <section className={styles.activityStats} aria-label="仕事の状況">
          <div>
            <strong>
              {
                state.commands.filter(
                  (c) =>
                    c.kind === 'run' && ['queued', 'claimed'].includes(c.state),
                ).length
              }
            </strong>
            <span>進行中</span>
          </div>
          <div>
            <strong>
              {state.jobs.filter((j) => j.noahExecution?.result).length}
            </strong>
            <span>届いた成果</span>
          </div>
          <div>
            <strong>
              {state.devices?.filter((d) => d.online && !d.revoked).length}
            </strong>
            <span>接続中のMac</span>
          </div>
        </section>
      )}
      {phoneWork}
      <section className={styles.activityList} id="work">
        <h2>{engineeringAgentId ? 'このAgentの試行と成果' : '仕事と成果'}</h2>
        {state && !commands?.length && (
          <div className={styles.empty}>
            <p>まだ仕事はありません。</p>
            {!engineeringAgentId && <Link className={styles.primary} href="/noah/explore">Agentを選んで始める</Link>}
          </div>
        )}
        {commands?.map((c) => {
          const job = state?.jobs.find((j) => j.id === c.id)?.noahExecution;
          return (
            <article
              key={c.id}
              className={styles.activityCard}
              data-state={c.state}
            >
              <h3>
                {c.agent.name} · {c.kind === 'connect' ? '接続' : '仕事'}
              </h3>
              <p>
                {['queued', 'claimed'].includes(c.state) && (
                  <span className={styles.activityDot} aria-hidden="true" />
                )}
                {c.kind === 'connect' &&
                c.state === 'succeeded' &&
                !c.currentBoot
                  ? 'Macの再接続が必要です'
                  : c.stopRequested &&
                      ['claimed', 'succeeded'].includes(c.state)
                    ? '停止要求を送信済み'
                    : (status[c.state] ?? c.state)}
              </p>
              {!engineeringAgentId && !workId && c.kind === 'run' && (
                <Link href={`/noah/work/${encodeURIComponent(c.id)}`}>
                  仕事の詳細を開く
                </Link>
              )}
              {c.result?.message && <p>{c.result.message}</p>}
              {job?.result && (
                <>
                  <h4>届いた成果</h4>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {job.result.text}
                  </pre>
                  <p>
                    <Link href="/noah/data">成果一覧</Link>
                  </p>
                  {job.result.files.map((f) => (
                    <p key={f.name}>
                      <button
                        onClick={() => {
                          const bytes = Uint8Array.from(atob(f.base64), (x) =>
                              x.charCodeAt(0),
                            ),
                            url = URL.createObjectURL(
                              new Blob([bytes], {
                                type: 'application/octet-stream',
                              }),
                            ),
                            a = document.createElement('a');
                          a.href = url;
                          a.download = f.name.split('/').at(-1)!;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        成果を保存：{f.name}
                      </button>
                    </p>
                  ))}
                </>
              )}
              {job?.error && <p>{job.error}</p>}
              {(['queued', 'claimed'].includes(c.state) ||
                (c.kind === 'connect' && c.state === 'succeeded')) &&
                !c.stopRequested && (
                  <button
                    disabled={pending}
                    onClick={() => void act('stop', { id: c.id })}
                  >
                    {c.kind === 'connect' ? '接続を停止' : '仕事を停止'}
                  </button>
                )}
            </article>
          );
        })}
      </section>
    </Container>
  );
}
