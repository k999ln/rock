'use client';

import { Cable, CheckCircle2, ShieldCheck } from 'lucide-react';

const capabilities = [
  '売上・数量・粗利・期限からCampaign Autopilotを作成',
  '顧客履歴・購入意向・次の一手をSales Conciergeで管理',
  '入金後の原価・資材・能力・納期をProduction Cockpitで管理',
  '広告・DM・売上・制作を経営ダッシュボードで確認',
];

export function FashionBrandOpsRunner() {
  return (
    <section className="fashion-ops-runner" aria-label="ファッションブランド運営の接続状態">
      <div className="fashion-ops-status">
        <Cable size={20} />
        <div>
          <strong>PCのMCPとして接続</strong>
          <p>38個の専用操作をSkyやCodexから確認・呼び出せます。</p>
        </div>
      </div>
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
        <summary>開発版を接続する手順</summary>
        <ol>
          <li>このリポジトリの toolkits/fashion-brand-ops をPCに用意します。</li>
          <li>.env.exampleを参考に、利用するProviderだけを安全な秘密情報保管先へ設定します。</li>
          <li>.mcp.jsonをSky対応MCPクライアントへ登録し、tools/listで専用操作を確認します。</li>
        </ol>
        <p>初期状態はすべてmockです。外部投稿・請求・返金は行いません。</p>
      </details>
    </section>
  );
}
