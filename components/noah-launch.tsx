'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  currentBoot: boolean;
  agent: { agentId: string; name: string };
  result?: { message?: string; workId?: string };
};
type State = {
  canReview?: boolean;
  ownerScope: string;
  devices: { id: string; name: string; online: boolean; revoked: boolean }[];
  commands: Command[];
  uploadedAgents: (Agent & { ready: boolean })[];
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
export default function NoahLaunch() {
  const params = useSearchParams(),
    [agents, setAgents] = useState<Agent[]>([]),
    [state, setState] = useState<State | null>(null),
    [error, setError] = useState(''),
    [signedOut, setSignedOut] = useState(false),
    [device, setDevice] = useState(''),
    [selected, setSelected] = useState(params.get('agent') ?? ''),
    [prompt, setPrompt] = useState(''),
    [consent, setConsent] = useState(false),
    [pending, setPending] = useState(false),
    [retry, setRetry] = useState<{
      action: string;
      body: Record<string, unknown>;
      scope: string;
    } | null>(null),
    [notice, setNotice] = useState('');
  async function refresh(signal?: AbortSignal) {
    const r = await fetch('/api/noah/launch', { signal, cache: 'no-store' }),
      d = (await r.json()) as State & { error?: string };
    if (r.status === 401) {
      setSignedOut(true);
      setState(null);
      return;
    }
    if (!r.ok) throw new Error(d.error ?? 'Noahの応答を確認できません。');
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
        old || d.devices.find((v: { online: boolean }) => v.online)?.id || '',
    );
  }
  useEffect(() => {
    const c = new AbortController();
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
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : '読込失敗');
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
  }, []);
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
      ...(state?.uploadedAgents.filter((a) => a.ready) ?? []),
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
    online = state?.devices.some(
      (d) => d.id === device && d.online && !d.revoked,
    );
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1>Agentを使う</h1>
          <p>集める、つなぐ、仕事を任せる。成果も停止もNoahで。</p>
        </div>
      </header>
      <nav className={styles.nav}>
        <Link href="/noah/agents/new?launch=1">自分のAgentを登録</Link>
        <Link href="/noah/publisher">掲載・公開を管理</Link>
        <Link href="/noah/mac">Macを接続</Link>
        {state?.canReview && <Link href="/noah/review">審査</Link>}
      </nav>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
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
          <Link href="/account?mode=login&returnTo=%2Fnoah%2Flaunch">
            サインイン
          </Link>
        </section>
      )}
      <section className={styles.notice}>
        <h2>使うMac</h2>
        {state && (
          <>
            <label>
              接続先
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value)}
              >
                <option value="">Macを選択</option>
                {state.devices
                  .filter((d) => !d.revoked)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.online ? '接続中' : 'オフライン'}
                    </option>
                  ))}
              </select>
            </label>
            {!online && (
              <p>
                MacのNoah Runnerを起動してください。
                <Link href="/noah/mac">初めての接続</Link>
              </p>
            )}
            {device && (
              <button
                disabled={pending}
                onClick={() => void act('revoke', { id: device })}
              >
                このMacの接続を解除
              </button>
            )}
          </>
        )}
        <p>
          AgentはMacの専用環境で処理します。あなたの画面・入力・ブラウザは操作しません。
        </p>
      </section>
      <section className={styles.notice} id="library">
        <h2>自分が登録したAgent</h2>
        {!state?.uploadedAgents.length && <p>まだ登録していません。</p>}
        {state?.uploadedAgents.map((a) => (
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
        <h2>対応Agent・公開されたAgent</h2>
        <p>
          この一覧は対応した実行方式に絞っています。初回は本体とモデルの準備に時間がかかります。
        </p>
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
        {chosen && (
          <>
            <h3>{chosen.name}</h3>
            <p>{chosen.summary}</p>
            <p>
              版：{chosen.version} ·{' '}
              {chosen.model === 'codex-account'
                ? '本人のCodexの利用枠を使用'
                : '本人Macのローカル処理'}
            </p>
          </>
        )}
        <button
          disabled={!state || !selected || !online || pending || Boolean(retry)}
          onClick={() =>
            void act('connect', {
              id: crypto.randomUUID(),
              deviceId: device,
              agentId: selected,
            })
          }
        >
          {connection ? '再接続する' : '自分のNoahに追加して接続'}
        </button>
        {connection && (
          <div>
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
              この内容で実行
            </button>
          </div>
        )}
      </section>
      <section className={styles.notice} id="work">
        <h2>接続と仕事</h2>
        {!state?.commands.length && <p>まだ仕事はありません。</p>}
        {state?.commands.map((c) => {
          const job = state.jobs.find((j) => j.id === c.id)?.noahExecution;
          return (
            <article key={c.id}>
              <h3>
                {c.agent.name} · {c.kind === 'connect' ? '接続' : '仕事'}
              </h3>
              <p>
                {c.kind === 'connect' &&
                c.state === 'succeeded' &&
                !c.currentBoot
                  ? 'Macの再接続が必要です'
                  : c.stopRequested &&
                      ['claimed', 'succeeded'].includes(c.state)
                    ? '停止要求を送信済み'
                    : (status[c.state] ?? c.state)}
              </p>
              {c.result?.message && <p>{c.result.message}</p>}
              {job?.result && (
                <>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {job.result.text}
                  </pre>
                  <p><Link href="/noah/data">成果データを検索・保存・提供する</Link></p>
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
    </main>
  );
}
