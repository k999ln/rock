'use client';

import { Cable, CheckCircle2, ShieldCheck } from 'lucide-react';

const capabilities = [
  'ブランド方針・商品デザインと市場判定',
  '画像・動画、投稿案、Instagram運用',
  'DM分類、FAQ下書き、購入意向判定',
  '注文・決済・制作・発送・分析',
];

export function FashionBrandOpsRunner() {
  return (
    <section className="fashion-ops-runner" aria-label="ファッションブランド運営の接続状態">
      <div className="fashion-ops-status">
        <Cable size={20} />
        <div>
          <strong>PCのMCPとして接続</strong>
          <p>28個の専用操作をSkyやCodexから確認・呼び出せます。</p>
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
          価格変更、画像・動画生成、投稿・広告出稿、DM送信、請求、返金は、内容を確認して承認するまで実行されません。
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
