# Instagram運用・受注型ブランド管理 — RockstarOS Hub統合

更新日: 2026-09-12。対象branch: `codex/fashion-brand-ops-sky`。

利用者の明示要望により、`k999ln/Mr.`のOne Hubではなく、`k999ln/rock`のRockstarOS Automation Hubを統合先とする。既存のHub catalog、商品ごとの実行場所・費用・権限表示、MCP接続境界を維持する。

## 実装範囲

- Hub表示名: `Instagram運用・受注型ブランド管理`
- 商品ID: `org.rockstar.fashion-brand-ops`
- 実装: `toolkits/fashion-brand-ops`
- 接続: stdio MCP、または認証・tenant固定のloopback/HTTP MCP
- DB: tenant-scoped SQLite migrations
- Provider: Creative、Social、Payment、Notificationを差し替え可能
- 安全な初期値: 全Provider `mock`、本番接続・実請求・実投稿なし

MCPはブランド方針・商品design、市場判定、creative、Instagram account list/switch、content plan、draft/caption、承認、schedule/publish、insights sync、DM classification/FAQ draft、注文、Stripe link/Invoice/refund準備、Webhook照合、制作・発送、通知、広告/DM/売上feedbackを28 toolとして公開する。

## 承認境界

価格変更、外部creative生成、予約、公開、広告出稿、DM送信、決済link作成、Invoice送信、返金、通知送信はprepareとexecuteを分離する。executeは短期署名grant、payload digest、idempotency keyを検査し、曖昧な外部失敗を`reconciliation_required`で止める。

Instagram password、Cookie、raw tokenをDBへ保存しない。credentialは`env://`、`vault://`、`broker://`参照だけを保持する。スクリーンショット由来のhandleは未確認候補であり、OAuth readbackなしでconnected扱いにしない。

## 検証境界

ローカルのmock Provider、MCP protocol、SQLite、Webhook署名、Hub catalog/manifest整合を検証する。Higgsfield、Meta、Stripe、通知先の実credentialは接続せず、実投稿、広告費、請求、返金、送信を行わない。QEMU/Android/実機OSへこの商品を組み込んだ証拠ではない。

## 検証結果

2026-09-12に`npm run verify`を完走した。RockstarOS本体96 test、Fashion Brand Ops 10 test、型検査、静的検査、production build、Worker/D1 API 143 assertionsがすべて成功した。MCPの`tools/list`は28 toolを返し、tool call、承認digest/期限/一回実行、Stripe/Meta署名、account切替、content plan、draft、schedule、insights、DM分類、受注、入金eventの冪等反映、分析feedbackをmockまたはfixtureで確認した。

決済event反映は公開MCP toolにせず、署名検証済みWebhookだけが呼ぶ内部処理に限定した。公開MCPは読み取り専用`fashion.payment.status.get`を提供する。実Higgsfield、実Meta account、実Stripe、通知先は未接続であり、この検証による外部投稿・広告費・請求・返金・送信はない。
