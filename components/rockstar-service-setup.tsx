'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import type { serviceSetupStore } from '@/lib/rockstar-service-setup-store';
import styles from './rockstar-service-setup.module.css';
type View = Awaited<ReturnType<ReturnType<typeof serviceSetupStore>['view']>>;
const money = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'USD' }).format(
    n / 100,
  );
const messages: Record<string, string> = {
  deferred_until_os_ready:
    'OSの受入完了後に利用できる機能です。現在は契約・課金・環境の追加を開始しません。',
  profile_required:
    '追加したeSIMの利用権を確認して、請求内容へ進んでください。',
  profile_verification_required:
    'eSIMと本人の利用権を確認できません。データは保持し、再確認を待っています。',
  contract_required: '料金・上限・停止と保存の条件を確認してください。',
  billing_setup_required:
    '月末請求に使う支払い方法を登録してください。この登録で料金は引き落としません。',
  billing_verification_required:
    '支払い方法の確認待ちです。画面へ戻っただけでは登録済みと判定しません。',
  environment_required: '同じ契約で専用環境を準備できます。',
  environment_verification_required:
    '専用Linuxの準備証拠を待っています。準備依頼の受付と、利用可能な状態は別です。',
  service_restricted:
    '契約・未払い・使用量の照合待ちで、新しい実行を制限しています。保存済みデータは保持されています。',
  active: 'Sky・Eveを使える準備が整いました。',
};
async function fetchSetupView(signal?: AbortSignal) {
  const response = await fetch('/api/rockstar/service-setup', {
    cache: 'no-store',
    signal,
  });
  const data = (await response.json()) as View & { error?: string };
  if (!response.ok)
    throw new Error(data.error || '状態を確認できませんでした。');
  return data;
}
export default function RockstarServiceSetup() {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState(''),
    [accepted, setAccepted] = useState(false),
    [recurring, setRecurring] = useState(false);
  async function refresh(signal?: AbortSignal) {
    const data = await fetchSetupView(signal);
    setView(data);
    setError('');
  }
  useEffect(() => {
    const c = new AbortController();
    void fetchSetupView(c.signal)
      .then((data) => {
        if (!c.signal.aborted) setView(data);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : '状態を確認できませんでした。',
          );
      });
    return () => c.abort();
  }, []);
  async function act(action: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/rockstar/service-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          revision: view?.setup?.revision,
          orderId: order,
          quoteDigest: view?.setup?.payload.quoteDigest,
          accepted,
          recurringAccepted: recurring,
        }),
      });
      const data = (await r.json()) as { error?: string; url?: string };
      if (!r.ok)
        throw new Error(data.error || '処理の結果を確認できませんでした。');
      if (data.url) {
        const u = new URL(data.url);
        if (
          u.protocol !== 'https:' ||
          u.hostname !== 'checkout.stripe.com' ||
          u.username ||
          u.password
        )
          throw new Error('支払い画面の接続先を確認できません。');
        window.location.assign(u.href);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '処理を完了できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  const setup = view?.setup?.payload,
    terms = setup?.terms,
    state = view?.access.state;
  return (
    <WorkspaceShell title="Sky・Eveの利用開始" hideTopActions>
      <main id="workspace-main" className={styles.setup} aria-busy={busy}>
        <header>
          <h1>自分のSky・Eveを使い始める</h1>
          <p>
            月額16ドルの利用枠付きプラン。超過分は事前に承認した上限内で月末に明細化します。
          </p>
        </header>
        <output className={styles.notice}>
          {state ? messages[state] : '利用開始の状態を確認しています…'}
        </output>
        {view?.readiness.osReady && !setup ? (
          <section>
            <h2>1. eSIMの利用権を確認</h2>
            <p>
              端末に追加したことと、Sky・Eveを使う契約の確認を別々に行います。
            </p>
            {view.eligibleOrders.length ? (
              <>
                <label>
                  確認済みのeSIM
                  <select
                    value={order}
                    onChange={(e) => setOrder(e.target.value)}
                  >
                    <option value="">選んでください</option>
                    {view.eligibleOrders.map((o, i) => (
                      <option key={o.orderId} value={o.orderId}>
                        確認済みのeSIM {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="rock-button"
                  disabled={busy || !order}
                  onClick={() => void act('draft')}
                >
                  請求内容を確認する
                </button>
              </>
            ) : (
              <p>
                確認済みの利用権がありません。
                <Link href="/sky/esim">eSIMの追加・確認へ</Link>
              </p>
            )}
          </section>
        ) : null}
        {setup && terms ? (
          <section>
            <h2>2. 請求内容と契約</h2>
            <dl>
              <div>
                <dt>基本月額</dt>
                <dd>{money(terms.baseMinor)}</dd>
              </div>
              <div>
                <dt>含まれるLinux利用枠</dt>
                <dd>{terms.includedCpuMs / 1000} CPU秒／月</dd>
              </div>
              <div>
                <dt>超過単価</dt>
                <dd>
                  {terms.cpuUnitMs / 1000} CPU秒あたり
                  {money(terms.cpuUnitMinor)}
                </dd>
              </div>
              <div>
                <dt>月間の承認上限</dt>
                <dd>{money(terms.monthlyCapMinor)}</dd>
              </div>
              <div>
                <dt>制限後の保存条件</dt>
                <dd>
                  {terms.retentionDays}
                  日。請求の確認・再開・許可された持出しは残します。
                </dd>
              </div>
            </dl>
            <p>
              今の引落額は0ドル。実際の請求はサービス利用開始後、基本料と確定した使用量を月末に集計します。
            </p>
            <p>
              <a
                href={terms.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                契約・解約・停止条件を読む
              </a>
            </p>
            {setup.acceptedAt === null ? (
              <>
                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  料金・利用枠・上限・停止と保存条件に同意します。
                </label>
                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                  />
                  契約条件に従う月末の継続請求に同意し、支払い方法を登録します。
                </label>
                <button
                  className="rock-button"
                  disabled={busy || !accepted || !recurring}
                  onClick={() => void act('accept')}
                >
                  この内容で契約する
                </button>
              </>
            ) : (
              <p>契約同意を保存しました。契約版：{terms.version}</p>
            )}
          </section>
        ) : null}
        {setup?.acceptedAt !== null && setup ? (
          <section>
            <h2>3. 支払い準備と専用環境</h2>
            {setup.billing.verifiedAt === null ? (
              <>
                <p>支払い方法の登録は、入金済みの証拠ではありません。</p>
                <button
                  className="rock-button"
                  disabled={busy}
                  onClick={() => void act('start-billing')}
                >
                  支払い方法を登録する
                </button>
                {setup.billing.sessionId ? (
                  <button
                    className="rock-button"
                    disabled={busy}
                    onClick={() => void act('reconcile-billing')}
                  >
                    登録結果を確認する
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p>月末請求の支払い方法を確認しました。</p>
                {!setup.workspaceId ? (
                  <button
                    className="rock-button"
                    disabled={busy}
                    onClick={() => void act('prepare-environment')}
                  >
                    専用環境を準備する
                  </button>
                ) : null}
              </>
            )}
            {view?.access.canOpenSkyEve ? (
              <nav className={styles.actions}>
                <Link className="rock-button" href="/chat">
                  Eveに依頼する
                </Link>
                <Link className="rock-button" href="/sky">
                  Skyで探す・追加する
                </Link>
              </nav>
            ) : null}
            {setup.workspaceId ? (
              <Link href="/sky/linux">
                契約・使用額・保存済みの仕事を確認する
              </Link>
            ) : null}
          </section>
        ) : null}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <button
          className="rock-button"
          disabled={busy}
          onClick={() =>
            void refresh().catch((e) => setError(String(e.message)))
          }
        >
          状態を読み直す
        </button>
        <p>端末のOSやデータを消す操作は、この手続きでは行いません。</p>
      </main>
    </WorkspaceShell>
  );
}
