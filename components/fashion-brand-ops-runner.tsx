'use client';

import { useEffect, useState } from 'react';
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
} from '@/lib/fashion-mcp-client';
import {
  buildFashionQuickPlan,
  type FashionQuickPlan,
} from '@/lib/fashion-quick-plan';

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
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [brandDirection, setBrandDirection] = useState('');
  const [productDesign, setProductDesign] = useState('');
  const [region, setRegion] = useState('');
  const [plan, setPlan] = useState<FashionQuickPlan | null>(null);
  const [planError, setPlanError] = useState('');
  const [candidates, setCandidates] = useState<AccountCandidate[]>([]);

  async function refreshCandidates() {
    try {
      const result = await callFashionMcpTool<AccountCandidate[]>(
        'instagram.accounts.candidates.list',
      );
      setCandidates(result);
    } catch {
      setCandidates([]);
    }
  }

  useEffect(() => {
    const update = () => setConnected(fashionMcpConnected());
    update();
    window.addEventListener('sky-fashion-mcp', update);
    if (fashionMcpConnected()) {
      void verifyFashionMcp()
        .then(({ toolCount }) => {
          setMessage(`${toolCount}個の専用操作へ接続しています。`);
          void refreshCandidates();
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
      onOutcome?.({ ok: true, text: `ブランド運営の下書きを作成しました。${next.campaignTitle}。投稿・広告・DM・決済は実行していません。詳細はこのカードで確認してください。` });
    } catch (error) {
      setPlan(null);
      const message = error instanceof Error ? error.message : '入力を確認してください。';
      setPlanError(message);
      onOutcome?.({ ok: false, text: message });
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
      className="fashion-ops-runner"
      aria-label="ファッションブランド運営"
    >
      <div className="fashion-quick-intro">
        <Sparkles size={20} />
        <div>
          <strong>Producerモード</strong>
          <p>楽しい部分だけ決めると、AIが販売の裏方を組みます。</p>
        </div>
      </div>
      <div className="fashion-quick-form">
        <label>
          <span>どんな世界にする？</span>
          <textarea
            value={brandDirection}
            maxLength={1200}
            placeholder="例：静かで無機質な高級感。完全受注生産。売り込み感は出さない。"
            onChange={(event) => setBrandDirection(event.target.value)}
          />
        </label>
        <label>
          <span>何をつくる？</span>
          <textarea
            value={productDesign}
            maxLength={1200}
            placeholder="例：黒いウールのワイドスラックス。立体的なタック、納期3週間。"
            onChange={(event) => setProductDesign(event.target.value)}
          />
        </label>
        <label>
          <span>どこへ届けたい？ <small>任意</small></span>
          <input
            value={region}
            maxLength={80}
            placeholder="空欄ならAIに任せる"
            onChange={(event) => setRegion(event.target.value)}
          />
        </label>
        <button className="black-button" onClick={createQuickPlan}>
          <Sparkles size={16} />
          プロデュース開始
        </button>
      </div>
      {planError && (
        <output className="fashion-ops-message is-error">{planError}</output>
      )}
      {plan && (
        <div className="fashion-quick-result" aria-label="ブラウザ簡易プラン">
          <header className="fashion-producer-head">
            <small>CAMPAIGN 01</small>
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
              <p className="fashion-quick-copy">{plan.caption}</p>
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
          <section className="fashion-producer-calendar">
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
          <section className="fashion-producer-flow">
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
          <p className="fashion-quick-boundary">
            <ShieldCheck size={16} />
            {plan.approvalBoundary}
          </p>
        </div>
      )}

      <details className="fashion-mcp-advanced">
        <summary>PC・MCPにつないで本格運用する</summary>
        <div className="fashion-ops-status">
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
        <div className="fashion-ops-connect-actions">
          <button
            className="black-button"
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy ? (
              <RefreshCw size={16} className="fashion-ops-spinner" />
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
              className="secondary-button"
              onClick={() => {
                void disconnectFashionMcp().finally(() => {
                  setConnected(false);
                  setMessage('このタブのMCP接続を解除しました。');
                });
              }}
            >
              <Unplug size={15} />
              解除
            </button>
          )}
        </div>
        <p className="fashion-ops-connection-state" aria-live="polite">
          <span className={connected ? 'status-dot' : 'offline-dot'} />
          {connected ? 'このタブはPCのMCPへ接続中' : 'MCP未接続'}
        </p>
        {message && <output className="fashion-ops-message">{message}</output>}
        <section
          className="fashion-photo-intake"
          aria-labelledby="fashion-photo-intake-title"
        >
          <div className="fashion-photo-intake-heading">
            <ImagePlus size={20} />
            <div>
              <strong id="fashion-photo-intake-title">
                Instagramは写真から候補化
              </strong>
              <p>
                このCodexタスクへプロフィール画面を送ると、公開表示だけを本人確認候補にします。
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
            <div className="fashion-photo-candidates">
              <div>
                <strong>写真から見つけた候補</strong>
                <button onClick={() => void refreshCandidates()}>更新</button>
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
          <p className="fashion-photo-privacy">
            画像本体・パスワード・Cookieは運用DBへ保存しません。Meta確認前の候補では投稿やDMを実行できません。
          </p>
        </section>
        <ul>
          {capabilities.map((capability) => (
            <li key={capability}>
              <CheckCircle2 size={16} />
              {capability}
            </li>
          ))}
        </ul>
        <ol>
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
