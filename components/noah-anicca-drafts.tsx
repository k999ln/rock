'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import styles from './noah-coconala.module.css';
import { macPost } from './noah-coconala-mac';

type Draft = { listingId: string; title: string; reason: string; body: string };
type Report = {
  requestId: string;
  state: 'scanning' | 'waiting' | 'stopping' | 'stopped' | 'interrupted';
  pass: number;
  scanned: number;
  nextAt: number | null;
  note: string;
  drafts: Draft[];
};
type Command = 'start' | 'status' | 'stop';
const key = 'noah.anicca.draft.run';
const server = '/servers/noah-anicca-draft/';
const stateLabels = {
  scanning: '公開案件を確認・提案を作成中',
  waiting: '次の探索を待機中',
  stopping: '停止を確認中',
  stopped: '停止しました',
  interrupted: 'Macの接続終了で中断しました',
};

function savedRun() {
  const link =
    /^#run=([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.exec(
      window.location.hash,
    );
  return link?.[1] || localStorage.getItem(key) || '';
}
function subscribeRun(update: () => void) {
  const events = ['storage', 'hashchange', 'noah-draft-run'];
  for (const event of events) window.addEventListener(event, update);
  return () => {
    for (const event of events) window.removeEventListener(event, update);
  };
}

function macAgent() {
  let token = '';
  let tail = Promise.resolve();
  async function call(command: Command, requestId: string) {
    if (!token) {
      const grant = await macPost<{ token: string }>('/connect', {});
      const entries = await fetch('http://127.0.0.1:38483/servers', {
        headers: { Authorization: 'Bearer ' + grant.token },
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      });
      if (!entries.ok) throw Error('Macへの接続を確認してください。');
      const data = (await entries.json()) as {
        servers: { id: string; state: string }[];
      };
      const agent = data.servers.find((row) => row.id === 'noah-anicca-draft');
      if (!agent)
        throw Error('Macの接続プログラムを最新版に更新して起動してください。');
      if (agent.state !== 'connected')
        await macPost(server + 'connect', {}, grant.token);
      token = grant.token;
    }
    const args = { name: command, arguments: { requestId } };
    const approval = await macPost<{ approvalToken: string }>(
      server + 'prepare',
      args,
      token,
    );
    const reply = await macPost<{ result: { structuredContent: Report } }>(
      server + 'execute',
      { ...args, approvalToken: approval.approvalToken, confirmed: true },
      token,
    );
    const report = reply.result?.structuredContent;
    if (
      !report ||
      report.requestId !== requestId ||
      !Object.hasOwn(stateLabels, report.state) ||
      !Array.isArray(report.drafts)
    )
      throw Error('Macからの結果を照合できません。');
    return report;
  }
  return (command: Command, id: string) => {
    const next = tail
      .then(() => call(command, id))
      .catch((error) => {
        token = '';
        throw error;
      });
    tail = next.then(
      () => {},
      () => {},
    );
    return next;
  };
}
export default function NoahAniccaDrafts() {
  const agent = useMemo(() => macAgent(), []);
  const id = useSyncExternalStore(subscribeRun, savedRun, () => '');
  const [storedReport, setReport] = useState<Report | null>(null);
  const report = storedReport?.requestId === id ? storedReport : null;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const current = useRef(''),
    guard = useRef(false);
  const run = useCallback(
    async (command: Command, runId: string) => {
      try {
        const result = await agent(command, runId);
        if (current.current === runId) {
          setReport(result);
          setError('');
        }
        return true;
      } catch (e) {
        if (current.current === runId)
          setError(
            e instanceof Error && !(e instanceof TypeError)
              ? e.message
              : 'このMacで接続プログラムを起動し、Noahからのローカルネットワーク接続を許可してください。',
          );
        return false;
      }
    },
    [agent],
  );
  const finished =
    report?.state === 'stopped' || report?.state === 'interrupted';
  useEffect(() => {
    if (!id || finished) return;
    current.current = id;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!live) return;
      const ok = await run('status', id);
      if (live) timer = setTimeout(poll, ok ? 2500 : 10000);
    }
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, finished, run]);
  async function act(command: 'start' | 'stop') {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    try {
      const runId =
        command === 'start' && (!id || finished) ? crypto.randomUUID() : id;
      if (!runId) return;
      current.current = runId;
      if (runId !== id) setReport(null);
      const ok = await run(command, runId);
      if (ok || !id) {
        localStorage.setItem(key, runId);
        window.history.replaceState(null, '', '#run=' + runId);
        window.dispatchEvent(new Event('noah-draft-run'));
      }
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <h1 className="text-2xl font-semibold">DaisukeのココナラAgent</h1>
      <p>
        このMacで公開案件を探し、提案を下書きします。画面を閉じても、Macと接続プログラムが動いている間は15分ごとに探します。応募・返信は送信しません。
      </p>
      {(!report || finished) && (
        <button type="button" disabled={busy} onClick={() => void act('start')}>
          {finished
            ? 'もう一度探す'
            : id
              ? '実行を再確認'
              : '案件を探して下書きする'}
        </button>
      )}
      {id && !finished && (
        <button type="button" disabled={busy} onClick={() => void act('stop')}>
          Agentを停止
        </button>
      )}
      <output aria-live="polite">
        {error ||
          (report ? stateLabels[report.state] : busy ? 'Macに接続中…' : '')}
      </output>
      {report?.note && <output>{report.note}</output>}
      {report && report.pass > 0 && (
        <p>
          直近の公開募集 {report.scanned} 件
          {report.nextAt
            ? ' · 次の探索 ' +
              new Date(report.nextAt).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </p>
      )}
      {report && (
        <section aria-label="提案の下書き">
          <h2>提案の下書き</h2>
          {report.drafts.length === 0 && <p>まだ下書きはありません。</p>}
          {report.drafts.map((d) => (
            <article className={styles.draft} key={d.listingId}>
              <h3>
                <a
                  href={'https://coconala.com/requests/' + d.listingId}
                  target="_blank"
                  rel="noreferrer"
                >
                  {d.title}
                </a>
              </h3>
              <p>選んだ理由　{d.reason}</p>
              <p className="whitespace-pre-wrap">{d.body}</p>
            </article>
          ))}
        </section>
      )}
      <details>
        <summary>Macの準備</summary>
        <p>
          Python 3とOllamaの qwen3:4b
          を用意します。avokado-mainで次を実行している間、Noahから利用できます。
        </p>
        <pre>{'cd toolkits/noah-coconala\nnpm ci\nnpm start'}</pre>
      </details>
    </main>
  );
}
