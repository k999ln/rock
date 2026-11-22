'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { macPost as post } from './noah-coconala-mac';
import styles from './noah-coconala.module.css';

const base = 'http://127.0.0.1:38483';
const server = '/servers/noah-coconala/';
const names = {
  reply: 'メッセージに返信',
  room_reply: 'トークルームに返信',
  apply: '応募',
  deliver: '正式な納品',
};
const targets = {
  reply: 'メッセージのスレッド番号',
  room_reply: 'トークルーム番号',
  apply: '公開依頼の番号',
  deliver: 'トークルーム番号',
};
type Action = keyof typeof names;
type Args = Record<string, string | number>;
type Pending = { action: Action; args: Args; ticket: string };
type Receipt = { requestId: string; state: string; message: string };
export default function NoahCoconala() {
  const [action, choose] = useState<Action>('reply'),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null),
    [notice, setNotice] = useState(''),
    [last, setLast] = useState('');
  const form = useRef<HTMLFormElement>(null),
    lock = useRef(false);
  async function perform(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setNotice(
        e instanceof Error && !(e instanceof TypeError)
          ? e.message
          : 'このMacの接続を確認してください。送信後は受付番号で結果を確認できます。',
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function connect() {
    const { token: key } = await post<{ token: string }>('/connect', {});
    const registry = await fetch(base + '/servers', {
      cache: 'no-store',
      redirect: 'error',
      credentials: 'omit',
      headers: { Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(6000),
    });
    if (!registry.ok) throw Error('Macの接続情報を確認できません。');
    const { servers } = (await registry.json()) as {
      servers: { id: string; state: string }[];
    };
    const entry = servers.find((item) => item.id === 'noah-coconala');
    if (!entry) throw Error('ココナラ専用の接続プログラムを起動してください。');
    if (entry.state === 'connecting')
      throw Error('接続中です。少し待ってから接続してください。');
    if (entry.state !== 'connected') await post(server + 'connect', {}, key);
    setToken(key);
    setLast(localStorage.getItem('noah.coconala.receipt') ?? '');
    setNotice('専用ブラウザの実行器に接続しました。');
  }
  async function prepare() {
    if (!form.current?.reportValidity()) return;
    const data = new FormData(form.current);
    const field = (name: string) => {
      const value = data.get(name);
      if (typeof value !== 'string') throw Error('入力を確認してください。');
      return value;
    };
    const args: Args = {
      requestId: crypto.randomUUID(),
      target: field('target').trim(),
      message: field('message').trim(),
    };
    if (action === 'apply') {
      args.price = Number(field('price'));
      args.due = field('due');
    }
    if (action === 'deliver') {
      args.filename = field('filename');
      args.sha256 = field('sha256');
    }
    const { approvalToken } = await post<{ approvalToken: string }>(
      server + 'prepare',
      { name: action, arguments: args },
      token,
    );
    setPending({ action, args, ticket: approvalToken });
  }
  function remember(id: string) {
    setLast(id);
    localStorage.setItem('noah.coconala.receipt', id);
  }
  async function execute(name: string, args: Args, ticket: string) {
    const body = {
      name,
      arguments: args,
      approvalToken: ticket,
      confirmed: true,
    };
    const { result } = await post<{ result: { structuredContent: Receipt } }>(
      server + 'execute',
      body,
      token,
    );
    const receipt = result.structuredContent;
    remember(receipt.requestId);
    setNotice(receipt.message);
  }
  async function send() {
    if (!pending) return;
    const { action, args, ticket } = pending;
    setPending(null);
    remember(String(args.requestId));
    await execute(action, args, ticket);
  }
  async function status() {
    const args = { requestId: last };
    const { approvalToken } = await post<{ approvalToken: string }>(
      server + 'prepare',
      { name: 'status', arguments: args },
      token,
    );
    await execute('status', args, approvalToken);
  }
  return (
    <main className={styles.page}>
      <h1 className="text-2xl font-semibold">ココナラの仕事</h1>
      <Link className={styles.agentLink} href="/noah/coconala/agent">DaisukeのココナラAgent · 案件を探して下書き</Link>
      {!token && (
        <>
          <p>ココナラにログインした専用のChromeを、このMacの裏で動かします。</p>
          <details>
            <summary>初めて使うMacの準備</summary>
            <p>
              avokado-mainのフォルダで順に実行してください。ログイン後、専用ウィンドウを閉じて起動します。
            </p>
            <pre className="overflow-auto">
              cd toolkits/noah-coconala{'\n'}npm ci{'\n'}npm run login{'\n'}npm
              start
            </pre>
          </details>
          <button onClick={() => void perform(connect)} disabled={busy}>
            このMacに接続
          </button>
        </>
      )}
      {token && (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void perform(prepare);
          }}
        >
          <fieldset disabled={busy || !!pending} className="grid gap-4">
            <label>
              操作
              <select
                className="block w-full border p-2"
                value={action}
                onChange={(e) => choose(e.target.value as Action)}
              >
                {Object.entries(names).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {targets[action]}
              <input
                key={action}
                className="block w-full border p-2"
                name="target"
                required
                inputMode="numeric"
                pattern="[0-9]{1,20}"
              />
            </label>
            <label>
              送る本文
              <textarea
                className="block w-full border p-2"
                name="message"
                required
                maxLength={10000}
                rows={5}
              />
            </label>
            {action === 'apply' && (
              <>
                <label>
                  応募金額（円）
                  <input
                    name="price"
                    type="number"
                    min="1"
                    max="99999999"
                    required
                  />
                </label>
                <label>
                  納品予定日
                  <input type="date" name="due" required />
                </label>
              </>
            )}
            {action === 'deliver' && (
              <>
                <p>
                  Macで <code>{'node mac.mjs stage "ファイルのパス"'}</code>{' '}
                  を実行し、表示された2項目を入力してください。
                </p>
                <label>
                  ファイル名
                  <input
                    className="block w-full border p-2"
                    name="filename"
                    required
                  />
                </label>
                <label>
                  SHA-256
                  <input
                    className="block w-full border p-2"
                    name="sha256"
                    required
                    pattern="[a-f0-9]{64}"
                  />
                </label>
              </>
            )}
            <button type="submit">送信内容を確認</button>
          </fieldset>
        </form>
      )}
      {pending && (
        <section className="grid gap-2">
          <h2>{names[pending.action]}の確認</h2>
          <p>
            {targets[pending.action]}　{pending.args.target}
          </p>
          <p className="whitespace-pre-wrap">{pending.args.message}</p>
          {pending.action === 'apply' && (
            <p>
              {Number(pending.args.price).toLocaleString()}円　納品予定{' '}
              {pending.args.due}
            </p>
          )}
          {pending.action === 'deliver' && (
            <p className="break-all">
              {pending.args.filename}　{pending.args.sha256}
            </p>
          )}
          <button disabled={busy} onClick={() => void perform(send)}>
            この内容で{names[pending.action]}する
          </button>
          <button disabled={busy} onClick={() => setPending(null)}>
            編集に戻る
          </button>
        </section>
      )}
      <output>{busy ? '処理中…' : notice}</output>
      {token && last && (
        <section>
          <p className="break-all">受付番号 {last}</p>
          <button disabled={busy} onClick={() => void perform(status)}>
            この操作の結果を確認
          </button>
        </section>
      )}
    </main>
  );
}
