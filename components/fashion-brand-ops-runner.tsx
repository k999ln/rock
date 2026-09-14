'use client';

import { useEffect, useState } from 'react';
import {
  Cable,
  Check,
  CheckCircle2,
  Download,
  ImagePlus,
  RefreshCw,
  ShieldCheck,
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

export function FashionBrandOpsRunner() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
    } else {
      void connectFashionMcp()
        .then((result) => {
          setConnected(true);
          setMessage(
            `${result.toolCount}個の専用操作を確認しました。Skyから実行できます。`,
          );
          void refreshCandidates();
        })
        .catch((error) => {
          setConnected(fashionMcpConnected());
          setMessage(
            error instanceof Error
              ? error.message
              : 'Sky接続アプリを起動してから、もう一度お試しください。',
          );
        })
        .finally(() => setBusy(false));
    }
    return () => window.removeEventListener('sky-fashion-mcp', update);
  }, []);

  async function connect() {
    setBusy(true);
    setMessage('');
    try {
      const result = await connectFashionMcp();
      setConnected(true);
      setMessage(
        `${result.toolCount}個の専用操作を確認しました。Skyから実行できます。`,
      );
      void refreshCandidates();
    } catch (error) {
      setConnected(fashionMcpConnected());
      setMessage(
        error instanceof Error
          ? error.message
          : 'Sky接続アプリを起動してから、もう一度お試しください。',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="fashion-ops-runner"
      aria-label="ファッションブランド運営の接続状態"
    >
      <div className="fashion-ops-status">
        {connected ? <Check size={20} /> : <Cable size={20} />}
        <div>
          <strong>{connected ? 'MCP接続済み' : 'PCのMCPへ接続'}</strong>
          <p>
            {connected
              ? 'Fashion Brand Opsの40操作を確認できました。'
              : '接続アプリが動いていれば、このボタン1回で準備が完了します。'}
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
      <div className="fashion-ops-approval">
        <ShieldCheck size={19} />
        <p>
          計画と下書きは自動化できます。価格変更、画像・動画生成、投稿・広告出稿、DM送信、請求、返金は、内容を確認して承認するまで実行されません。
        </p>
      </div>
      <details>
        <summary>初回だけ必要な準備</summary>
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
