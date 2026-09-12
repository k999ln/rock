# Sky「サブスク顧問」接続 — 2026-09-12

## 今回入れたもの

自動化Hub（Sky）の商品カタログへRockstar Ledgerを「サブスク顧問」として追加した。PCでローカル台帳を起動すると、Skyの商品画面から次を読み取り専用で確認できる。

- 月額換算（通貨ごと）
- 契約・定期課金候補の件数
- 支払い失敗などの要対応
- 契約名、状態、金額、更新日
- Rockstar Ledgerの完全なローカル画面への入口

配布ZIP、MIT全文、Codex向けskill、stdio MCPサーバーをHubと同じGitに同梱した。元パッケージはRockstar Ledger `0d3f29f3f8986669ac6516cea252aa2fa506a1ef`、ZIP SHA-256は `abfdbbc884fb0723f74a1f4ece73cbe755104312eb1ec51e4f4f83bdb0224651`。

## データと安全境界

契約・カード明細・検出結果はPC内のSQLiteへ保存し、Gitへ入れない。Skyから許可するブラウザ接続元も `http://127.0.0.1`、`http://localhost`、`http://[::1]` に限定した。Sky画面は表示と更新だけを行い、編集、解約、支払い、申告、外部送信はしない。金額は通貨別に保持し、為替換算なしで合算しない。

現在の直接接続はローカル開発版Skyと同じPCで使う試作である。HTTPS配信版からHTTP loopbackへ直接接続する経路、Native SkyのMCP broker常駐、Walletへの費用転記は未実装として残す。

## 検証

- Rockstar Ledger Python unit tests: 3件合格
- loopback CORS: `http://127.0.0.1:3000` へ200と限定Allow-Originを返すことを確認
- Sky catalog/package tests: `tests/rockstar-ledger.test.mjs`
- Skyの型、lint、全95 tests、本番build、Worker/D1 API 143 assertions: `npm run verify` 合格
- Sky画面の実接続: 商品選択、通貨別集計、警告、一覧を確認。error overlayなし、console error 0

個人の契約名・金額が映る画面画像はGitへ保存せず、個人情報を除いた[機械可読の検証記録](evidence/sky-rockstar-ledger/integration.json)だけを残した。

税理士の判断や法定申告の代替をうたわず、契約と経費の確認を速くする「顧問型」の補助ツールとして扱う。
