# OSバックエンド・ローンチ手順（2026-09-12）

## ローンチ範囲

今回の利用可能範囲は、本人限定Sites上のWeb/Sky、D1へ保存する仕事・履歴・設定、ブラウザ内ツール、PC上のSky MCP Connector、Fashion Brand Opsのmock／ローカル運用である。実Meta投稿、実広告、実DM送信、実請求・返金、実払出し、LIVE取引、スマホ実機OSは含めない。未設定の外部作用は成功を装わず停止する。

## 優先順位

- P0: Web起動、認証済みAPI、ユーザー分離、D1移行、仕事の作成から完了・再開、MCP接続・解除・承認、Fashionの受注フロー、精算核の安全停止、ログ、配布物、本人限定Sites反映、Git保存。
- P1: Meta／Stripe／Higgsfield／通知Providerのsandbox接続、精算Worker用D1・secret・Provider入金照合、OAuthブラウザ認証。
- P2: Sky Cloudの一般MCP、実払出し、LIVE取引、Android／QEMU／物理端末、一般公開。

## データフロー

```text
Sites認証 → Web API → D1（ユーザー別）
Sky → localhost Connector → MCP initialize/tools/list
    → exact approval → tools/call → receipt/reconciliation
Fashion MCP → SQLite（tenant/brand/order/customer/effect）
Provider署名Webhook → order/earning receipt → 追記型台帳
```

管理APIはSitesが付与する認証済みuser IDを使い、更新時は同一Originを要求する。ローカルMCPはloopback Hostと許可Originを両方検査する。価格変更、投稿、広告、DM、請求、返金、通知は短期・一回限り・payload固定の承認を必要とする。結果不明の外部作用は自動再送しない。

## ローカル起動・終了・再起動

Node.js 22.13以上を使う。

```sh
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npm run dev
```

本番build相当は`npm run build`後に`npm start`。終了は実行中のプロセスへ`Ctrl-C`を送り、再起動は同じ起動commandを再実行する。仕事、設定、台帳はD1／SQLiteへ保存されるため、プロセス再起動で処理を自動再実行しない。

PC接続は配布ZIPを展開して`Sky MCP接続.command`を起動する。Fashion専用接続は`RockstarOS Sky接続.command`を起動する。外部Providerを使わない初期状態ではmockを維持する。

## 必要設定

- Web/Sites: `DB` D1 binding。精算Workerを接続する場合のみ`BILLING_SERVICE_URL`と共有secret。
- Sky MCP Connector: `registry.json`。遠隔tokenはRegistryへ書かず、許可した環境変数名から読む。
- Fashion: `.env.example`を正本にし、ローカル外へbindする場合はbearer tokenとtenant IDを必須にする。
- 精算Worker: `BILLING_SHARED_SECRET`と`SETTLEMENT_INGEST_SECRET`をsecret storeへ入れ、`SKY_ORIGIN`をexact HTTPS Originにする。

実値、顧客データ、SQLite DB、鍵をGitへ保存しない。

## 監視と安全な失敗

- Web: 認証なし401、別Origin 403、入力過大413、競合409／503を確認する。
- MCP: 接続passport、tool digest、接続時刻、再接続状態を確認する。
- Fashion: `/health`と`fashion.system.readiness`で不足設定だけを確認する。secret値は返さない。
- 精算Worker: `/health`、署名・重複・競合・payout leaseを確認する。旧先払いAPIは410。

`npm run verify`が、型、lint、全Web test、D1履歴移行、MCP配布物、Fashion test、Worker dry-run、本番build、API 143 assertionをまとめて検査する。

## 復旧・ロールバック

1. 新しい外部Provider設定を解除し、全Providerを`mock`へ戻す。
2. Sitesで直前の保存済みversionを再deployする。D1 migrationは既存列・表を削除せず追加で扱うため、DBを逆移行しない。
3. MCPはSkyから切断し、Connectorを終了する。結果不明の操作は再実行せずreceipt／Provider readbackで照合する。
4. Gitは直前の合格commitから新しい復旧branchを作り、強制pushや履歴破棄をしない。

精算・支払い・返金・顧客データの不整合がある場合は機能を停止したままにし、台帳を手で上書きしない。
