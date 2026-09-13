# RockstarOS 受注型Fashion Brand Ops MCP

RockstarOS Skyへ商品として追加する、受注型ファッションブランド運営用のMCP serviceです。ブランド方針と商品designを入口に、目標、target判定、creative、Instagram、DM、受注、決済、制作・発送、通知、分析feedbackを一つのtenant-scoped workflowとして扱います。

PULSE試作の「投稿企画 → caption → 承認 → 予約 → calendar → 分析」を実データ用のdomainへ移し、Instagram運用を独立したMCP tool群として公開しています。既定は全providerが`mock`です。credential不足、未許可host、署名なしapprovalでは外部作用を実行しません。

## 実装境界

```text
brand policy + product design
  → sales / units / margin / deadline goal → Campaign Autopilot
  → market assessment
  → creative brief → Creative Provider
  → Instagram content plan / draft / calendar
  → signed approval → Social Provider
  → DM classify / FAQ draft / purchase intent
  → AI Sales Concierge → customer stage / next-best action / unsent reply
  → customer + made-to-order order
  → signed approval → Payment Provider
  → verified webhook → paid / production / shipping
  → Production Cockpit → BOM / cost / capacity / due date / blockers
  → metrics + DM + sales → versioned creative feedback
```

Providerは次の4種類です。

| 種類 | safe default | production adapter |
|---|---|---|
| Creative | `mock` | `higgsfield`（operator指定のexact HTTPS endpoint） |
| Social | `mock` | `meta-graph`（Meta公式Graph API/OAuth token）、`instagram-http`（OAuth bridge） |
| Payment | `mock` | `stripe` |
| Notification | `mock` | `webhook` |

custom endpointは`FASHION_ALLOWED_HOSTS`のexact hostnameに一致しない限り拒否します。password、browser Cookie、raw OAuth tokenはDBへ保存しません。Instagram接続recordが保存するのはaccount ID、username、状態、`env://` / `vault://` / `broker://` credential referenceだけです。

スクリーンショットから読めた`insta_akume`、`iceiceice.mean`、`luckyluckylucky_f`は[`config/account-candidates.example.json`](config/account-candidates.example.json)に未確認候補としてのみ記録しています。Meta OAuth readbackで一致するまでconnected accountとしてimportしません。

Skyの画像理解は、画像byteのSHA-256と画面に見えた公開プロフィール情報だけを`instagram.accounts.intake_screenshots`へ渡します。MCPはusername単位で候補をまとめ、画像本体やローカルpathを受け付けません。`instagram.accounts.candidates.list`で確認待ち候補を読み、Meta OAuth readbackと一致した候補だけを接続済みaccountへ関連付けます。

## Approval gate

価格変更、creative provider実行、予約・公開・広告出稿、DM返信、決済link、Invoice送信、返金、通知送信は二段階です。

1. `*.prepare`または価格変更toolが、payload digest付き`approval_id`を作る。
2. Hubの人間承認面がexact digestを確認し、`ROCKSTAR_APPROVAL_SECRET`で短期grantを署名する。
3. `approval.execute`が署名、期限、digest、idempotency keyを確認して一度だけ実行する。
4. provider readback digestを含むreceiptを保存する。

外部call開始後の失敗は安全側に`reconciliation_required`で停止します。自動retryして二重投稿・二重請求・二重返金を起こしません。

ローカル確認用の署名commandは次です。本番Hubでは同じ署名contractをsecret vault内で実装し、grant tokenをUI承認なしで発行しないでください。

```bash
npm run approval:sign -- <approval-id> <actor-id>
```

## MCP tools

主なFashion Brand Ops tools:

- `fashion.brand.upsert`, `fashion.product.upsert`, `fashion.market.analyze`
- `fashion.creative.prepare`
- `fashion.order.collect`, `fashion.order.status.update`
- `fashion.payment.prepare`, `fashion.payment.status.get`（入金eventの反映は署名検証済みWebhook限定）
- `fashion.notification.prepare`
- `fashion.metrics.record`, `fashion.analytics.get`, `fashion.feedback.build`, `fashion.dashboard.get`
- `fashion.autopilot.goal.create`, `fashion.autopilot.get`, `fashion.autopilot.tick`, `fashion.autopilot.run`
- `fashion.concierge.prepare`, `fashion.sales.pipeline.get`
- `fashion.production.plan`, `fashion.production.dashboard`, `fashion.executive.dashboard`
- `fashion.system.readiness`（秘密値を返さず、本番接続の不足だけを診断）

独立したInstagram運用 tools:

- `instagram.accounts.list`, `instagram.accounts.discover`, `instagram.accounts.register`, `instagram.accounts.switch`
- `instagram.accounts.intake_screenshots`, `instagram.accounts.candidates.list`
- `instagram.content_plan.create`, `instagram.draft.create`
- `instagram.schedule.prepare`, `instagram.publish.prepare`, `instagram.ad.prepare`
- `instagram.calendar.list`, `instagram.insights.sync`
- `instagram.dm.classify`, `instagram.dm.reply.prepare`
- `approval.list`, `approval.execute`

`instagram.accounts.discover`と`instagram.insights.sync`はread-onlyです。`publish`とDM送信は必ず共通approval gateへ入ります。自動like、follow、無差別DMは実装していません。

## Local run

Node.js 22.13以上を使用します。外部dependencyはありません。

```bash
cd toolkits/fashion-brand-ops
cp .env.example .env
export ROCKSTAR_APPROVAL_SECRET="$(openssl rand -hex 32)"
npm run db:migrate
npm test
npm start
```

stdio MCP clientは`.mcp.json`を読み込みます。HTTP/Webhook modeは次です。

```bash
npm run start:http
curl http://127.0.0.1:8787/health
```

## Skyからワンクリック接続

配布版の`RockstarOS Sky接続.command`を初回に開いておけば、Skyの商品カードで「接続」を1回押すだけで、loopback session発行、MCP initialize、initialized通知、tools/listによる40操作の確認まで完了します。接続状態はそのタブのsession storageだけに保持し、解除時はlocal sessionも失効します。

ブラウザ接続は`FASHION_BROWSER_ORIGINS`のexact originと`127.0.0.1:8787`等のloopback Hostが両方一致する場合だけ許可します。CORSとPrivate Network Accessのpreflightに対応し、originごとに12時間以内のrandom session tokenを発行します。wildcard origin、URL内credential、cookie、永続tokenは使いません。

Endpoints:

- `POST /mcp` — sessionless JSON-RPC MCP。loopback以外へbindする場合は`FASHION_MCP_BEARER_TOKEN`と`ROCKSTAR_TENANT_ID`必須
- `POST /connect` — 許可済みSky originからのloopback browser session発行
- `POST /disconnect` — 現在のbrowser sessionを失効
- `GET /webhooks/instagram` — Meta verify challenge
- `POST /webhooks/instagram` — `X-Hub-Signature-256`検証付きInstagram DM intake
- `POST /webhooks/stripe` — Stripe signature検証と入金readback

## Meta OAuth / multi-account

Direct adapterでは`FASHION_SOCIAL_PROVIDER=meta-graph`、versionを含む`META_GRAPH_API_BASE_URL`、OAuthで得た`META_ACCESS_TOKEN`をprocess secretとして渡します。同じMeta authorizationで利用可能なProfessional accountを`instagram.accounts.discover`が公式APIから読み取れます。別tokenをtenantごとに扱う本番構成は`instagram-http`を選び、credential brokerがaccount別tokenを解決してください。

DBの`social_accounts.is_active`はbrand/providerごとに一つだけです。`instagram.accounts.switch`は接続済みaccountにだけ切替可能です。

## DB

SQLite schemaは`db/migrations`にあり、次を保持します。

- brands / products / market assessments / creative assets
- Instagram accounts / content plans / campaigns / DM messages
- customers / orders / fulfillment events
- approvals / effect runs / provider events
- metrics / versioned feedback snapshots
- business goals / prioritized workflow actions
- customer journeys / production jobs

Webhook eventとeffect idempotency keyはuniqueです。Stripe署名はraw body、timestamp tolerance、constant-time comparisonで検証します。local DB fileは`0600`、格納directoryは`0700`へ制限します。productionでは暗号化volumeまたはtenant-isolated databaseを使い、このunique境界とtenant keyを保持してください。

## RockstarOS Sky registration

[`rockstaros-tool.json`](rockstaros-tool.json)が商品ID、MCP runtime、capability、Provider、approval policy、費用境界の正本です。[`sky-submission.json`](sky-submission.json)はSky掲載契約、Web Skyの`lib/catalog.ts`はready商品とTimeline表示を保持します。

stdioではMCP clientがこのdirectoryの`.mcp.json`を読み、`initialize → tools/list → tools/call`で40個の操作をdiscover/callできます。`fashion.autopilot.run`は投稿計画・下書き・承認要求など内部作業だけを最大25件まで進め、投稿・DM送信・課金などの外部作用は実行しません。HTTP modeをloopback以外へbindする場合は、bearer tokenとtenant IDの両方を必須にします。RockstarOSのplatform署名鍵、Wallet送金権限、root、任意shellはこの商品へ渡しません。

Skyの商品名は **Instagram運用・受注型ブランド管理** です。Timelineと検索欄で「Instagram運用」から直接見つけられます。account list/switch、content plan、draft/caption、approval、schedule/publish、insights sync、DM classificationを同じ商品内の独立MCP toolとして公開します。外部Providerのcredentialと実費契約は商品本体やRockstarOS月額から分離し、実アカウント接続、広告出稿、請求、返金は設定と個別承認が揃うまでfail closedです。
