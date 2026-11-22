# 123 NoahのCLI管理クラウドと提供元接続

本人指示（2026-11-22）: CLI型の実行環境をクラウドに用意し、利用者の設定なしでNoahから接続・利用する。指定元クラウドへの直接接続も扱う。

正本: [サービス契約](../../docs/services/noah-cloud-agents.md)。対象は `services/noah-cloud-agents/`、`lib/noah-cloud-*`、Agent詳細/接続UIとAPI、関連試験。

合格条件: 公式Agentの実クラウド処理、本人/Origin/再送/停止/上限/鍵非露出、スマホで接続→依頼→結果再表示。公開結果・CI・PRは受入後に記録する。

状態: 実装中。Cloudflare既存ログインはcontainers:write不足。本人は再認証を操作できると回答済み。
