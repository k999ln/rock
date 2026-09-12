# Instagram運用・受注型ブランド管理 — RockstarOS Sky統合

更新日: 2026-09-12。対象branch: `codex/fashion-brand-ops-sky`。

利用者の明示要望により、`k999ln/Mr.`のOne Hubではなく、`k999ln/rock`のSkyを統合先とする。内部互換名のHub catalogを維持しつつ、Skyの商品ごとの実行場所・費用・権限表示、Timeline、MCP接続境界へ統合する。

## 実装範囲

- Sky表示名: `Instagram運用・受注型ブランド管理`
- 商品ID: `org.rockstar.fashion-brand-ops`
- 実装: `toolkits/fashion-brand-ops`
- 接続: stdio MCP、または認証・tenant固定のloopback/HTTP MCP
- DB: tenant-scoped SQLite migrations
- Provider: Creative、Social、Payment、Notificationを差し替え可能
- 安全な初期値: 全Provider `mock`、本番接続・実請求・実投稿なし

MCPは既存のブランド方針、Instagram、DM、注文、決済、制作・発送、分析に加え、Campaign Autopilot、AI Sales Concierge、Production Cockpit、経営ダッシュボード、本番接続診断を38 toolとして公開する。Autopilotは売上・数量・粗利・期限・広告上限から優先操作を提示し、bounded runでは市場整理、投稿計画、投稿下書き、creative承認要求、制作計画など安全な内部作業だけを進める。外部作用は直接実行しない。Conciergeは返信を下書きに留め、Production Cockpitは検証済み入金後だけ制作計画を作る。

## 承認境界

価格変更、外部creative生成、予約、公開、広告出稿、DM送信、決済link作成、Invoice送信、返金、通知送信はprepareとexecuteを分離する。executeは短期署名grant、payload digest、idempotency keyを検査し、曖昧な外部失敗を`reconciliation_required`で止める。

Instagram password、Cookie、raw tokenをDBへ保存しない。credentialは`env://`、`vault://`、`broker://`参照だけを保持する。スクリーンショット由来のhandleは未確認候補であり、OAuth readbackなしでconnected扱いにしない。

## 検証境界

ローカルのmock Provider、MCP protocol、SQLite、Webhook署名、Sky catalog/Timeline/掲載契約の整合を検証する。Higgsfield、Meta、Stripe、通知先の実credentialは接続せず、実投稿、広告費、請求、返金、送信を行わない。native Skyの汎用JSON MCP画面、QEMU/Android/実機OSへこの商品を組み込んだ証拠ではない。

## 検証結果

2026-09-12のv0.2.0全体検証で、RockstarOS本体103 test、Fashion Brand Ops 14 test、型検査、静的検査、production build、Worker/D1 API 143 assertionsがすべて成功した。MCPの`tools/list`は38 toolを返し、目標保存、投稿計画・下書き・承認要求までの安全な自動run、顧客journey、制作計画、接続診断に加え、既存の承認digest/期限/一回実行、Stripe/Meta署名、account切替、schedule、insights、DM分類、入金eventの冪等反映、分析feedbackをmockまたはfixtureで確認した。さらにSkyのローカル画面でTimeline、catalog、詳細ダイアログを開き、38操作、接続条件、approval gateの表示とエラーoverlayがないことを確認した。

実装commit `d1a428f` を[Draft PR #10](https://github.com/k999ln/rock/pull/10)へpushし、同一SHAの`verify`、native partition 5件、`source-tests`がすべて成功した。これはmock/fixtureとWeb表示の合格であり、Meta credential、Professional account、公開Webhook、実投稿の合格ではない。

決済event反映は公開MCP toolにせず、署名検証済みWebhookだけが呼ぶ内部処理に限定した。公開MCPは読み取り専用`fashion.payment.status.get`を提供する。実Higgsfield、実Meta account、実Stripe、通知先は未接続であり、この検証による外部投稿・広告費・請求・返金・送信はない。
