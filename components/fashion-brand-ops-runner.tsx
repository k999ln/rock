'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  Cable,
  Check,
  CheckCircle2,
  Download,
  ImageIcon,
  ImagePlus,
  ListChecks,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Unplug,
} from 'lucide-react';
import {
  callFashionMcpTool,
  connectFashionMcp,
  disconnectFashionMcp,
  fashionMcpConnected,
  FASHION_MCP_URL,
  verifyFashionMcp,
  startFashionProducer,
  verifyFashionProducerSaved,
  type FashionProducerInput,
  type FashionProducerResult,
  type FashionReadiness,
} from '@/lib/fashion-mcp-client';
import {
  buildFashionQuickPlan,
  type FashionQuickPlan,
} from '@/lib/fashion-quick-plan';
import styles from '@/components/fashion-brand-ops-runner.module.css';

type AccountCandidate = {
  id: string;
  username: string;
  verification_status:
    | 'needs_owner_confirmation'
    | 'oauth_matched'
    | 'dismissed';
  screenshot_count: number;
};

const capabilities = [
  '売上・数量・粗利・期限からCampaign Autopilotを作成',
  '顧客履歴・購入意向・次の一手をSales Conciergeで管理',
  '入金後の原価・資材・能力・納期をProduction Cockpitで管理',
  '広告・DM・売上・制作を経営ダッシュボードで確認',
];

export function FashionBrandOpsRunner({ onOutcome }: {
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
} = {}) {
  const photoIntakeTitle = useId();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [brandDirection, setBrandDirection] = useState('');
  const [productDesign, setProductDesign] = useState('');
  const [region, setRegion] = useState('');
  const [plan, setPlan] = useState<FashionQuickPlan | null>(null);
  const [planError, setPlanError] = useState('');
  const [candidates, setCandidates] = useState<AccountCandidate[]>([]);
  const [candidateError, setCandidateError] = useState('');
  const [producer, setProducer] = useState<FashionProducerResult | null>(null);
  const [running, setRunning] = useState(false);
  const runLock = useRef(false);
  const attempt = useRef<{ signature: string; input: FashionProducerInput } | null>(null);
  const [readiness, setReadiness] = useState<FashionReadiness | null>(null);
  const [readinessError, setReadinessError] = useState('');
  const [readbackMessage, setReadbackMessage] = useState('');

  async function refreshReadiness(brandId?: string) {
    try {
      const next = await callFashionMcpTool<FashionReadiness>('fashion.system.readiness', brandId ? { brand_id: brandId } : {});
      setReadiness(next);
      setReadinessError('');
    } catch {
      setReadiness(null);
      setReadinessError('外部サービスの準備状態を確認できませんでした。接続を再確認してください。');
    }
  }

  async function refreshCandidates() {
    try {
      const result = await callFashionMcpTool<AccountCandidate[]>(
        'instagram.accounts.candidates.list',
      );
      setCandidates(result);
      setCandidateError('');
    } catch {
      setCandidates([]);
      setCandidateError('Instagram候補の一覧を取得できませんでした。');
    }
  }

  useEffect(() => {
    const update = () => {
      const active = fashionMcpConnected();
      setConnected(active);
      if (!active) setReadiness(null);
    };
    update();
    window.addEventListener('sky-fashion-mcp', update);
    if (fashionMcpConnected()) {
      void verifyFashionMcp()
        .then(({ toolCount }) => {
          setMessage(`${toolCount}個の専用操作へ接続しています。`);
          void refreshCandidates();
          void refreshReadiness();
        })
        .catch(() =>
          setMessage('接続が切れました。もう一度接続してください。'),
        );
    }
    return () => window.removeEventListener('sky-fashion-mcp', update);
  }, []);

  function createQuickPlan() {
    setPlanError('');
    try {
      const next = buildFashionQuickPlan({ brandDirection, productDesign, region });
      setPlan(next);
      setProducer(null);
      onOutcome?.({ ok: true, text: `ブラウザ内の簡易下書きを作成しました。${next.campaignTitle}。バックエンド保存・LLM生成・投稿・決済は実行していません。` });
    } catch (error) {
      setPlan(null);
      const message = error instanceof Error ? error.message : '入力を確認してください。';
      setPlanError(message);
      onOutcome?.({ ok: false, text: message });
    }
  }

  async function runProducer() {
    if (runLock.current) return;
    const worldview = brandDirection.trim();
    const product = productDesign.trim();
    if (worldview.length < 2 || product.length < 2) {
      setPlanError('ブランド方針と商品デザインをそれぞれ2文字以上で入力してください。');
      return;
    }
    runLock.current = true;
    setRunning(true);
    setPlanError('');
    setReadbackMessage('');
    setPlan(null);
    setProducer(null);
    const inputValues = { worldview, product_design: product, ...(region.trim() ? { region: region.trim() } : {}) };
    const signature = JSON.stringify(inputValues);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, input: { run_id: crypto.randomUUID(), ...inputValues } };
    try {
      if (!fashionMcpConnected()) {
        await connectFashionMcp();
        setConnected(true);
      }
      const result = await startFashionProducer(attempt.current!.input);
      setProducer(result);
      setReadbackMessage('PCのデータベースから下書きを読み直し、保存を確認しました。');
      await refreshReadiness(result.brand.id);
      onOutcome?.({ ok: true, text: `ブランド運営のプランをPCへ保存し、下書きの再読込を確認しました。記録ID: ${result.run_id}。投稿・画像生成・決済は実行していません。` });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'プランを保存できませんでした。';
      setPlanError(`${message} 入力を変えずに再実行すると、同じ記録IDで確認します。`);
      onOutcome?.({ ok: false, text: message });
    } finally {
      setConnected(fashionMcpConnected());
      setRunning(false);
      runLock.current = false;
    }
  }

  async function readSavedDraft() {
    if (!producer || runLock.current) return;
    runLock.current = true;
    setRunning(true);
    setPlanError('');
    setReadbackMessage('');
    try {
      await verifyFashionProducerSaved(producer);
      setReadbackMessage('保存済みの下書きをPCから再読込し、内容が一致しました。');
    } catch (cause) {
      setPlanError(cause instanceof Error ? cause.message : '保存した下書きを確認できませんでした。');
    } finally {
      setRunning(false);
      runLock.current = false;
    }
  }

  async function connect() {
    setBusy(true);
    setMessage('');
    try {
      const result = await connectFashionMcp();
      setConnected(true);
      setMessage(
        `${result.toolCount}個の専用操作を確認しました。Skyから実行できます。`,
      );
      onOutcome?.({ ok: true, text: `PCのブランド運営MCPに接続しました。${result.toolCount}機能を確認しました。個別操作の成功は各実行結果で確認してください。` });
      void refreshCandidates();
      void refreshReadiness(producer?.brand.id);
    } catch (error) {
      setConnected(fashionMcpConnected());
      const message = error instanceof Error
        ? error.message
        : 'Sky接続アプリを起動してから、もう一度お試しください。';
      setMessage(message);
      onOutcome?.({ ok: false, text: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={styles.runner}
      aria-label="ファッションブランド運営"
    >
      <div className={styles.intro}>
        <Sparkles size={20} />
        <div>
          <strong>Producerモード</strong>
          <p>ブランドと商品の方針から、投稿計画・下書き・制作依頼をPCへ保存します。現在のプラン作成はルールベースで、LLM生成ではありません。</p>
        </div>
      </div>
      <div className={styles.form}>
        <label>
          <span>どんな世界にする？</span>
          <textarea
            disabled={running}
            value={brandDirection}
            maxLength={1200}
            placeholder="例：静かで無機質な高級感。完全受注生産。売り込み感は出さない。"
            onChange={(event) => setBrandDirection(event.target.value)}
          />
        </label>
        <label>
          <span>何をつくる？</span>
          <textarea
            disabled={running}
            value={productDesign}
            maxLength={1200}
            placeholder="例：黒いウールのワイドスラックス。立体的なタック、納期3週間。"
            onChange={(event) => setProductDesign(event.target.value)}
          />
        </label>
        <label>
          <span>どこへ届けたい？ <small>任意</small></span>
          <input
            disabled={running}
            value={region}
            maxLength={80}
            placeholder="空欄なら日本を起点にオンライン"
            onChange={(event) => setRegion(event.target.value)}
          />
        </label>
        <div className={styles.runActions}>
          <button type="button" className={styles.primaryButton} onClick={() => void runProducer()} disabled={running || busy}>
            {running ? <RefreshCw size={16} className={styles.spinner} /> : <Sparkles size={16} />}
            {running ? '保存を確認中…' : 'プランを作って保存'}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={createQuickPlan} disabled={running || busy}>
            ブラウザ内で下書きを作る
          </button>
        </div>
        <p className={styles.modeNote}>{connected ? 'PCへ接続済み。投稿や決済は実行せず、プランと下書きだけを保存します。' : 'PCへ未接続。ローカル開発版では、保存時に接続を準備します。ブラウザ内の下書きは保存されません。'}</p>
      </div>
      {planError && (
        <p className={`${styles.message} ${styles.error}`} role="alert">{planError}</p>
      )}
      {producer && (
        <div className={styles.result} aria-label="PCに保存したブランド運営プラン">
          <header className={styles.resultHeading}>
            <small>PCに保存済み · {producer.idempotent_replay ? '保存済み記録を再表示' : '下書き作成完了'}</small>
            <h3>{producer.product.name}</h3>
            <p>記録ID：<code>{producer.run_id}</code></p>
          </header>
          <section>
            <Target size={18} />
            <div>
              <strong>販売先の仮説</strong>
              <p>{producer.market.primary_segment} · {producer.market.audience.age_range}歳</p>
              <p>{producer.market.audience.regions.join(' / ')}</p>
              <p>{producer.market.positioning}</p>
            </div>
          </section>
          <section>
            <Sparkles size={18} />
            <div>
              <strong>保存したInstagram下書き</strong>
              <p className={styles.copy}>{producer.first_draft.caption}</p>
              <small>下書きID：{producer.first_draft.id}</small>
            </div>
          </section>
          <section className={styles.calendar}>
            <ListChecks size={18} />
            <div>
              <strong>14日間の投稿計画</strong>
              <ol>{producer.content_plan.strategy.slots.map((slot) => (
                <li key={`${slot.date}-${slot.time}-${slot.pillar}`}>
                  <span>{slot.date} {slot.time}</span>
                  <small>{slot.format}</small>
                  <p>{slot.pillar}</p>
                </li>
              ))}</ol>
            </div>
          </section>
          <section>
            <ImageIcon size={18} />
            <div>
              <strong>画像制作の依頼文</strong>
              <p className={styles.copy}>{producer.creative.brief.prompt}</p>
              <small>制作依頼は保存済み。画像はまだ生成していません。</small>
            </div>
          </section>
          <section className={styles.flow}>
            <ShieldCheck size={18} />
            <div>
              <strong>次に決めること</strong>
              <ol>{producer.decisions_needed.map((item) => (
                <li key={item.key}><span>{item.label}</span><p>{item.reason}</p></li>
              ))}</ol>
              <p>外部操作の確認待ち：{producer.approval_queue.length}件。ここでは実行しません。</p>
            </div>
          </section>
          <button type="button" className={styles.secondaryButton} disabled={running || !connected} onClick={() => void readSavedDraft()}>保存した下書きを再確認</button>
          {readbackMessage && <output className={styles.message}>{readbackMessage}</output>}
        </div>
      )}
      {connected && readiness && (
        <section className={styles.readiness} aria-label="外部サービスの準備状態">
          <strong>外部サービスの準備状態</strong>
          <p>PCへの保存と、外部サービスの接続は別です。</p>
          <ul>{([
            ['instagram', 'Instagram'],
            ['creative', '画像・動画生成'],
            ['payment', '決済'],
            ['notification', '通知'],
          ] as const).map(([key, label]) => {
            const capability = readiness.capabilities[key];
            return <li key={key}><span>{label}</span><small>{capability.provider === 'mock' ? '模擬動作 · 実サービス未接続' : capability.ready ? `${capability.provider} · 設定済み、実行には承認が必要` : `${capability.provider} · 設定が必要`}</small></li>;
          })}</ul>
        </section>
      )}
      {readinessError && <p className={styles.error} role="alert">{readinessError}</p>}
      {plan && (
        <div className={styles.result} aria-label="ブラウザ簡易プラン">
          <header className={styles.resultHeading}>
            <small>ブラウザ内の簡易下書き · PCへの保存なし</small>
            <h3>{plan.campaignTitle}</h3>
            <p>{plan.launchLine}</p>
          </header>
          <section>
            <Target size={18} />
            <div>
              <strong>売る相手</strong>
              <p>{plan.audience}</p>
              <p>{plan.market}</p>
              <p>{plan.positioning}</p>
            </div>
          </section>
          <section>
            <ImageIcon size={18} />
            <div>
              <strong>広告ビジュアル案</strong>
              <p>{plan.imageBrief}</p>
              <small>{plan.videoBrief}</small>
            </div>
          </section>
          <section>
            <Sparkles size={18} />
            <div>
              <strong>Instagramキャプション</strong>
              <p className={styles.copy}>{plan.caption}</p>
            </div>
          </section>
          <section>
            <MessageCircle size={18} />
            <div>
              <strong>DM初回返信</strong>
              <p>{plan.dmReply}</p>
              <small>注文時に確認：{plan.orderFields.join(' / ')}</small>
            </div>
          </section>
          <section className={styles.calendar}>
            <ListChecks size={18} />
            <div>
              <strong>最初の1週間</strong>
              <ol>
                {plan.contentWeek.map((item) => (
                  <li key={item.day}>
                    <span>{item.day}</span>
                    <small>{item.format}</small>
                    <p>{item.theme}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
          <section className={styles.flow}>
            <Sparkles size={18} />
            <div>
              <strong>あとはこう動く</strong>
              <ol>
                {plan.producerFlow.map((item) => (
                  <li key={`${item.label}-${item.detail}`}>
                    <span>{item.label}</span>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ol>
              <small>最後に決めること：{plan.decisionsNeeded.join(' / ')}</small>
            </div>
          </section>
          <p className={styles.boundary}>
            <ShieldCheck size={16} />
            {plan.approvalBoundary}
          </p>
        </div>
      )}

      <details className={styles.advanced}>
        <summary>PC・MCPにつないで本格運用する</summary>
        <div className={styles.status}>
          {connected ? <Check size={20} /> : <Cable size={20} />}
          <div>
            <strong>{connected ? 'MCP接続済み' : 'PCのMCPへ接続'}</strong>
            <p>
              {connected
                ? 'Fashion Brand Opsの41操作を確認できました。'
                : '外部Provider、受注DB、承認フローを使う場合だけ接続します。'}
            </p>
          </div>
        </div>
        <div className={styles.connectActions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy || running}
            onClick={() => void connect()}
          >
            {busy ? (
              <RefreshCw size={16} className={styles.spinner} />
            ) : connected ? (
              <Check size={16} />
            ) : (
              <Cable size={16} />
            )}
            {busy
              ? 'MCPを確認中…'
              : connected
                ? '接続を再確認'
                : 'ワンクリックで接続'}
          </button>
          {connected && (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={running || busy}
              onClick={() => {
                void disconnectFashionMcp()
                  .then(() => setMessage('このタブのMCP接続を解除しました。'))
                  .catch(() => setMessage('このタブの接続情報を解除しました。PC側の切断確認はできませんでした。'))
                  .finally(() => setConnected(false));
              }}
            >
              <Unplug size={15} />
              解除
            </button>
          )}
        </div>
        <p className={styles.connectionState} aria-live="polite">
          <span className={`${styles.statusDot} ${connected ? styles.connected : ''}`} />
          {connected ? 'このタブはPCのMCPへ接続中' : 'MCP未接続'}
        </p>
        {message && <output className={styles.message} aria-live="polite">{message}</output>}
        <section
          className={styles.photoIntake}
          aria-labelledby={photoIntakeTitle}
        >
          <div className={styles.photoHeading}>
            <ImagePlus size={20} />
            <div>
              <strong id={photoIntakeTitle}>
                Instagramは写真から候補化
              </strong>
              <p>
                PC側のプロフィール取込で登録された公開表示を、本人確認候補として確認します。この画面には画像の取込機能はありません。
              </p>
            </div>
          </div>
          <ol>
            <li>
              <span>1</span>スクリーンショットを送る
            </li>
            <li>
              <span>2</span>候補を本人確認
            </li>
            <li>
              <span>3</span>初回だけMetaへ接続
            </li>
          </ol>
          {candidates.length > 0 && (
            <div className={styles.candidates}>
              <div>
                <strong>写真から見つけた候補</strong>
                <button type="button" className={styles.secondaryButton} onClick={() => void refreshCandidates()}>更新</button>
              </div>
              <ul>
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <span>@{candidate.username}</span>
                    <small>
                      {candidate.verification_status === 'oauth_matched'
                        ? 'Meta確認済み'
                        : '本人確認待ち'}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {candidateError && <p className={styles.error} role="alert">{candidateError}</p>}
          <p className={styles.photoPrivacy}>
            画像本体・パスワード・Cookieは運用DBへ保存しません。Meta確認前の候補では投稿やDMを実行できません。
          </p>
        </section>
        <ul className={styles.capabilities}>
          {capabilities.map((capability) => (
            <li key={capability}>
              <CheckCircle2 size={16} />
              {capability}
            </li>
          ))}
        </ul>
        <ol className={styles.setup}>
          <li>
            <a href="/toolkits/fashion-brand-ops-connector.zip" download>
              <Download size={14} />
              Sky接続アプリをダウンロード
            </a>
          </li>
          <li>展開したフォルダの「RockstarOS Sky接続.command」を開きます。</li>
          <li>
            .env.exampleを参考に、利用するProviderだけを安全な秘密情報保管先へ設定します。
          </li>
          <li>Skyへ戻り「ワンクリックで接続」を押します。</li>
        </ol>
        <p>
          接続先はこのPC（{FASHION_MCP_URL}
          ）だけです。初期状態はすべてmockで、外部投稿・請求・返金は行いません。
        </p>
      </details>
    </section>
  );
}
