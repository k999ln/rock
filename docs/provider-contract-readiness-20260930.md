# eSIM・クラウド供給元の契約準備

確認日: 2026-09-30。これは公開公式技術資料をもとにした契約前の比較であり、取引条件・販売権・日本国内の提供資格・見積・アカウント審査・sandbox accessを確認した結果ではない。外部への問い合わせ、契約、課金、実profile発行、配備はしていない。

## 結論

最初のeSIM商用・技術打診先は**1GLOBAL Connectを優先候補**、**eSIM GoをUX/APIの比較候補**にする。1GLOBAL ConnectはAccount／Subscriber／Product Offering／Orderと、文書化されたPOST/PATCH idempotency supportを持つため、本人単位の契約・二重発行防止に合う。一方eSIM Goは公開Quick Startでvalidate→transaction→QRを試せ、branding profileで回線のNetwork Name、Install Name、QR logo、Android Direct Installを設定できるため、「eSIM追加時にRockstarOSブランドを見せる」検証の質問が具体的。eSIM Goのbranding/network-nameはSIM/eSIMの表示とinstall UXであり、OSをeSIMへ格納/自動導入する意味ではない。どちらも日本での再販権、consumer eSIM適合、料金、サポート責任が決まった証拠はない。

クラウドは、現在のCloudflare Workers / D1 / Workflows実装を使い続けて**controller・API・durable orchestrationの第一候補**とする。継続jobは端末接続から独立して起動できる設計を既存実装へ重ねられ、Workers Paidは公開料金で小規模の入口費用を予測できる。一方、第三者agent・MCP・モデル推論は外部APIとして呼び、Cloudflare Worker内で重いLLM推論や任意生成コードを実行しない。隔離containerやGPUを自前運用する必要が生じた場合の第二候補はGoogle Cloud Run Jobs/Worker Pools。Cloudflareを契約済み、Cloud Runを接続済みとは扱わない。

## eSIM API比較

| 確認点 | 1GLOBAL Connect | eSIM Go |
|---|---|---|
| 公開された開始経路 | 利用権を得てcredentialを発行後、product offering・account・subscriberを用意し、orderでsubscription activationを開始 | accountにpositive balanceとAPI keyが必要。catalogue→validate order→transaction order→orderReferenceでQR ZIP取得 |
| 非同期結果 | profileがinstall可能になると`subscription.sim_profile.ready_for_installation`、注文成功/失敗で`order.completed` / `order.failed` event | transaction応答の`orderReference`とassignment照会、bundle状態照会、webhookを組合せる |
| 認証・秘密 / 重複 | 公式Getting StartedはcredentialとBearer tokenを前提とする。API idempotency文書がPOST/PATCHと同じkey再利用、in-flight 409を説明する。token scope、key保有者、保持期限を契約前に確認 | API keyを各requestの`X-API-Key` headerへ付与。組織ごとに単一keyと説明され、再発行は旧keyを直ちに無効化。V3 callbackはraw bodyのHMAC-SHA256署名。public docsで注文POSTのidempotencyを確認できていないため、応答消失時のprovider照合が必須 |
| eSIM配布・branding | APIでorder・profile provision・installの流れを提供。対応端末へのinstallation UXは別途実機確認 | 注文単位QR PNGとICCIDを返す。small orderではMatching ID / SM-DP+等がresponseに入る。承認済みbranding profileはstatus-bar Network Name、Install Name（各最大16字）、QRロゴ、Android Direct Installの設定項目を持つ。機能のアカウント適用条件は要確認 |
| 照合・重複 | eventの重複配送、order ID/idempotency、照会API、cancel/refundを実契約で確認 | orderReference保持、assignments/status照会、signed callbacksを使う。クライアント側request key、応答消失後の注文照合・再発行禁止はRockstar側で実装する |
| 公開資料だけでは不明 | 日本のcoverage/roaming、wholesale price、minimum commitment、resale/white-label、consumer support、sandbox、profile install eligibility、refund/cancellation | 同項目に加え、prepaid balance funding/refund、API keyの権限粒度、運用上の同時注文上限 |

1GLOBAL Connectの公式ガイドは新規eSIMの流れをproduct discovery、account/subscriber、order、profile-ready/order-result eventとして説明し、利用開始にはplatform accessが必要としている。idempotency docsはPOST/PATCHの同じkey利用と処理中409を説明する。[Getting Started](https://docs.connect-api.1global.com/overview/getstarted/) · [Getting a new eSIM](https://docs.connect-api.1global.com/next/recipes/new-esim) · [Idempotency](https://docs.connect-api.1global.com/api/idempotency)

2026-09-30の実装契約は**eSIM Go REST API v2.5**とCallback V3に固定。v2.5 order transaction responseは`orderReference`とorder内の`esims[]`にICCID/Matching ID/SM-DP+を返し、assignment GETは`/esims/assignments?reference=...`をJSONで照会できる。v2.5 docsはPOST注文によるorganization balance deductionを明記する一方、同endpointのclient idempotency keyを文書化していない。実装は事前validate、注文単位のD1 one-shot marker、transaction timeout/503時のresend禁止、provider_completedのassignment GET再開を行う。Matching ID等はDBへ保存せず、issue service responseにも含めない。[v2.5 Create orders](https://docs.esim-go.com/api/v2_5/operations/orders/post/) · [v2.5 Get order](https://docs.esim-go.com/api/v2_5/operations/ordersorderreference/get/) · [v2.5 assignments](https://docs.esim-go.com/api/v2_5/operations/esimsassignments/get/) · [Callback V3](https://docs.esim-go.com/guides/webhooks/) · [QR/install guide](https://docs.esim-go.com/guides/qr_delivery/)

### 契約前に相手へ確認すること

1. RockstarOSブランドで日本の個人へ販売できるか。販売主体、通信事業者としての責任、本人確認/KYC、消費税・請求書、利用規約/プライバシー、通信障害・返金の責任分界は何か。
2. 日本国内・海外 roamingの対応国/ネットワーク、data-only/voice/SMS、番号の有無、速度制限、APN、fair-use、テザリング、緊急通話制限、coverage実測値は何か。
3. wholesale単価、通貨、最低利用/前払残高、期限、失効、top-up、為替、税、取消/未使用refund、volume tier、請求データの遅延を見積書で示せるか。
4. sandboxは金銭・実profileなしで注文からinstall-ready eventまで再現できるか。productionへ切替えるapproval processと試験用ICCID/eUICCはどうなるか。
5. API idempotency key、重複event ID、署名のrotation、replay防止、status照会、発行不明の解消、取消/停止、障害SLAとrate limitをどう提供するか。
6. QR/activation code/SM-DP+等の機微値を返す場合、取得回数・再表示・有効期限・削除・監査ログ・support access制御はどうなるか。RockstarのDBへ平文保持せずに済むか。
7. branding/activation screen、端末に表示される回線名、Android/iOS LPA手順、carrier entitlement/OEM連携の要件と、RockstarOSの表示名が変えられる範囲はどこか。Android Direct Install等が使える場合も、端末側の導入許可・初期OS導入権限まで与えるわけではないことを契約仕様で確認する。
8. 顧客データのregion/retention/subprocessor、越境移転、security certification、incident通知期限、DPA、監査権、契約終了時export/deletion条件は何か。

**契約試験の合格条件:** sandboxで1件を作成し、Skyの購入注文・本人・device enrollmentへ結び、応答消失、duplicate callback、status照合、取消/失効を試す。profile secretをログ・Analytics・LLM・一般画面へ出さない。LPA/eUICCでinstall完了を確認するまではRockstarOS準備済みにしない。

## クラウド候補と費用境界

| 候補 | Rockstarで担う範囲 | 公開条件（確認日） | 適合と制約 |
|---|---|---|---|
| Cloudflare Workers + Workflows + D1 + R2 | 認証済みjob受付、durable controller、status API、timer/poll、暗号化artifact | Workers Paid base $5/month。Standardは月10M requestと30M CPU msを含み、超過request $0.30/M、CPU $0.02/M ms。WorkflowsはPaidで月500k stepを含み、超過$0.80/100k steps。D1は月50M row writes・25B row reads・5GBを含み、超過write $1/M、read $0.001/M、storage $0.75/GB-month | 既存Cloudflare Workflow/D1実装と近い。durable stepは外部API呼出しの失敗点を分離し、前stepから再開できる。Worker invocation CPU/memory limitsはあるため、LLMやuntrusted codeの長時間計算をworkerで直接させない。D1/Workflows/R2各計上、logs/observability、外部model/agent費は別 |
| Google Cloud Run | containerized isolate worker、長めのcontainer task、必要時GPU inference | 公開料金はregionとCPU/memory/instance billingで従量。公式pricingの試算例ではCloud Run worker pool 1 vCPU/512MiBを1か月常時稼働で$11.61/月（free tier適用時。free tier抜き$16.83）。公式GPU service例は4 vCPU/16GiB + NVIDIA L4の特定traffic patternで$822.40/月 | containerの任意runtime/GPUは有利だが、この例をRockstarの実費見積としない。Cloud Run Jobsは即時実行で最大7日、delayedは最大12時間待ち・最大12時間実行と案内される。jobの再試行は副作用APIを自動再送しないよう独自idempotency/outboxが必要。Cloud Build/Artifact Registry/Eventarc/egress/LLM API等が例示額外 |

CloudflareはWorkflowsに永続multi-step実行、自動retry、長時間pause/resumeを提供し、料金とD1単価を公開している。[Workflows durable execution](https://developers.cloudflare.com/workflows/get-started/guide/) · [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Worker limits](https://developers.cloudflare.com/workers/platform/limits/)

GoogleはCloud Runをrequest-driven service、task-driven Jobs、pull-driven Worker Poolsに分け、Cloud Run Jobsの個別task timeout/retryを設定できる。価格例は特定region・resource・使用率条件に限る。[Cloud Run pricing](https://cloud.google.com/run/pricing) · [Cloud Run Jobs](https://cloud.google.com/run/docs/execute/jobs)

### Rockstar内の従量請求との接続

クラウドのinvoiceは、本人が払う通信費やAI従量額とは別に扱う。Cloudflare/Googleの共通基盤費、agent/API利用料、GPU費、eSIM卸単価、mobile data plan、creator payoutを別meter・別通貨・別price versionで記録する。利用者向けの実請求を有効にするのは、Wallet側の原子的予約、Providerの価格/利用量証跡、返金/reversal、月末invoice照合が接続され、契約上の課金主体が決まってからとする。

クラウド上で受付済みjobを続けるには永続job storeだけでなく、provider retryの前にpersistされたone-shot dispatch marker、indeterminate照合、expiry/cap停止、worker isolation、result encryption、owner authorizationが必要。本repoにCloudflare Workflows/D1の試作はあるが、production binding/secret、successful independent A2A provider、圏外端末との実機縦断は未受入。[continuity design](sky-cloud-continuity.md)

### 契約後のCloudflare secret・cron設定

Runtime WorkerのD1 bindingと1分cronは[wrangler.jsonc](../services/sky-agent-runtime/wrangler.jsonc)に定義済み。契約・production project選択後に、placeholderのD1 IDを実IDへ置き換え、migration適用とreadbackを確認する。secretは設定ファイルやGitへ書かず、Cloudflare secret storeへ投入する。

eSIM発行／callback endpointには`ESIMGO_API_KEY`、`ESIMGO_CALLBACK_DEDUPE_SECRET`、`ESIMGO_PROFILE_HASH_SECRET`を設定する。共有Sky Runtime Workerには`ESIMGO_API_KEY`、同じ目的で発行した`ESIMGO_PROFILE_HASH_SECRET`、および`ESIMGO_INSTALL_MATERIAL_KEY`を個別secretとして設定する。dedupe key・profile HMAC key・AES-GCM material keyは相互に異なる値とし、callback用keyやprovider API keyを暗号化keyへ流用しない。A2Aの`A2A_DELEGATION_EXECUTION_ENABLED`はeSIM設定から独立したままdefault-offにする。

契約後の受入順は、(1) sandbox credentialで署名付きcallbackを受ける、(2) shared D1 migration／secret bindingを読み戻す、(3) scheduled eventを一回起動し、既知referenceのGETだけが発生することとD1 stateを照合、(4) Workflow/Worker再起動後も同じProfileへ復帰しtransactionが増えないことを確認、(5) 実端末へinstallして利用権とoffline capabilityを別々に検証、の順とする。未契約のprovider key、D1 ID、production secretを本書へ記載しない。これらの設定・sandbox・production受入はまだ実行していない。

## API構成案を提示する時の必須境界

- `identity + Sky order/access + device capability`をまとめ、eSIM orderは本人の明示操作と再認証に結びつける。AI agentはplanを提示できるが実注文・top-up・費用上限変更を承認できない。
- Provider webhookはraw-body signatureを検証してからdurable inboxへ記録し、event ID/order/profile versionでdedupeする。署名失敗、順序逆転、重複はprofileを再発行しない。
- carrier secretsをeSIM adapterだけへ渡す。activation materialは短命・暗号化し、別APIのowner authorizationを得ないagentに返さない。
- `requested → issued → downloaded → installed → network-attached → service-enabled`を別状態にする。単に回線名が端末表示された状態をRockstarOS/LLM-readyにしない。
- cloud job acceptanceはprovider task完了と別状態。remote providerへ指示送信が不明なら同じremote taskを照合し、二個目へ再送しない。
- 価格表・対象国・API version・契約条項をversioned artifactにし、各job/eSIM orderにsnapshot digestを保存する。

## 現在の完成度

**契約準備:** 技術API比較・質問票・候補構成を作成。商用価格、販売責任、データ処理契約、契約主体、正式提案/見積は未取得。

**開発:** eSIMはhost/local-D1 fixtureの署名付きcallback inbox、server catalog、one-shot issuance、read-only known-reference reconciliation、profile-digest callback correlation、owner-bound install-material deliveryを実装。callbackは既存paid orderへ一致する場合のみ関連付け、通知だけでは利用権を有効化しない。Cloudflare A2A/controllerはsourceとhost/local Workflow testsがある。実Provider account、cloud production environment、eSIM order/Wallet entitlementの本番接続はない。

**今回追加したもの:** `POST /api/esim/webhooks/esim-go`はV3 raw-body HMAC検証後にD1 inboxへevent digest/typeと専用secret HMAC化profile referenceだけを書き、raw ICCID・本文は保存しない。internal binding helperはlive/paid・buyer・package key・manifest hash・refunded amount=0を照合。現行v2.5 clientはvalidate + expected currency/wholesale capを確認し、review-active paid Sky orderへone-shot markerを先に保存してから単一transaction POSTを行う。provider clientはretryしない。timeout、503、不正応答は`reconciliation_required`へ止め、同じSky orderの再要求で新しいtransactionを送らない。provider successを記録した後、profile digestだけをbinding tableへ保存し、binding失敗後は保存済みorderReferenceからassignment GETを使って再開する。GET応答のICCID digestが保存値と一致しなければbindingしない。Matching ID/SM-DP+はdatabaseやissue service responseへ出さない。provider transactionはserviceの`providerDebitEnabled` gateがtrueの場合だけ進む。実装済みはserver plan catalogと不変pricing snapshot、owner認証status/read-only reconcile、暗号化install-material delivery、既知order referenceに対するscheduled provider GET照合、およびsigned callback profile digestのknown-order correlationまで。未接続は既存Sky checkoutからの販売条件/本人認証連携、production D1/secrets/cron、実provider account/key/sandbox注文、Cloudflare再起動受入、実端末installである。
