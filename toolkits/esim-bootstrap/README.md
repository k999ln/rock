# Rockstar eSIM Bootstrap — Developer Preview

これは **eSIMの技術経路だけを模擬するhost-side開発fixture** です。製品の販売形態を限定するものではありません。現行製品は物理SIMまたはeSIMの購入にRockstarOSサービス利用権を含め、通信事業者・Rockstar直販・端末販売店・オンライン販売など複数チャネルから提供する設計です。fixtureは通信会社へ接続せず、回線や課金も発生しません。

## 実行

Node.js 22.13以上（今回の検証は26.0.0）、追加npm依存なし。

```sh
npm --prefix toolkits/esim-bootstrap run demo
npm --prefix toolkits/esim-bootstrap test
```

demoは一時ディレクトリにRockstarと模擬通信会社のSQLiteを別々に作り、終了時に削除します。`EsimBootstrap`と`FixtureEsimProvider`は指定したDBパスを使って再起動できます。署名鍵はdemo/test内だけで作る一時的なEd25519鍵です。OS/platform鍵、通信会社の鍵、production署名鍵ではありません。

## 実装した流れ

1. 開発用の本人・要求ID・初期pack（`lifeline` / `developer`）を固定して登録する。
2. DBへ`issuing`を保存してから模擬通信会社に発行を依頼する。
3. 発行・有効化状態を照合する。応答消失時は`reconciliation_required`とし、同じ要求を再発行しない。
4. 開発用端末登録を確認し、本人・端末・登録IDに結びついた署名付き構成を発行する。
5. 圏外を模擬したローカル署名検証を行う。オンラインでは利用権の失効・eSIM無効化・世代違いも確認する。
6. `POST /api/esim/webhooks/esim-go`はeSIM Go Callback V3のraw-body HMACを検証してdurable D1 inboxへ重複排除保存する。ICCIDはraw JSON tokenから読んで専用秘密鍵のHMACに変換し、そのdigestだけをbinding照合に使う。内部発行adapterは公式REST API v2.5のvalidate・費用上限・one-shot dispatch・transaction・profile/order binding・assignment GET復旧のfixture契約を実装。注文のpaid/owner/package/hash/review/refund状態を照合し、provider timeoutや処理不明では同じtransactionを再送しない。本文、ICCID、Matching ID、SM-DP+は保存せず、通知だけで利用権を有効化・延長・停止しない。
7. 既発行注文は認証済み`POST /api/esim/orders/{orderId}/reconcile`でprovider order detailとassignmentをread-only照合し、owner-scoped `GET /api/esim/orders/{orderId}/status`で状態を確認する。照合には保存済みの価格snapshotを使用する。
8. `services/sky-agent-runtime`の毎分cronは、設定が揃う場合のみ既知referenceかつpaid・未返金の注文を最大10件read-only照合する。provider debitは呼ばず、reference不明の`reconciliation_required`注文を自動再発行・推測照合しない。

`requested → issuing → issued → enabled`が正常系。`disabled`は更新不可、`deleted`は同一profileの再有効化不可。利用権の`revoked`は通信状態とは別に保存し、遅れて届いた有効化結果で戻しません。発行不明時にlookupが空でも未発行とは確定せず、自動再発行を止めます。

## この試作が返すもの

`rockstar-esim-bootstrap-fixture/1`はSkyの`sky-tool-package/1`に項目を追加せず、別の構成文書として扱います。packの内容は未公開の`fixture.*`識別子であり、実際のエージェントを実装・導入した意味ではありません。

- 初期packと追加のSky選択を許す方針。
- 受信機能がなければ`receiver_install_required`。
- ローカルruntimeや検証済みモデルがなければ`runtime_required` / `assets_required`。
- それらがあっても`inference_test_required`。推論が動いたとは判定しない。
- クラウドは`provider_connection_required`。
- 実行権限・OS書込み権限は常にfalse。

eSIMのインストール用QRコード・LPAコード・SM-DP+・ICCIDは生成しません。模擬データを電話へインストールできるeSIMに見せません。SIM/eSIM内でLLMを実行するコードでもありません。

## 既存製品へ接続する境界

主担当はWallet / Billing / ProvidersのROCK、既存BIL02に関連するhost fixtureです。既存Sky決済、Wallet、10%手数料、保留中の収益料金、native Brokerは変更しません。

- **本人と利用権**：このクラスは信頼されたテストコードから呼ぶ内部APIです。`owner`引数は認証機能ではありません。HTTPで公開してはなりません。本実装では既存の本人認証と`lib/sky-commerce-store.ts`の`access(order)`等を経由し、確認済みの対象注文・商品hash・所有者を固定する必要があります。`createFixtureEnrollment`を公開登録APIとして使わないでください。
- **発行**：`lib/esimgo-provider.ts`に公式v2.5のAPI契約adapter fixtureを実装。authenticated issue routeはserver-owned catalogとpaid Sky orderに束縛し、provider debit gateはdefault-off。server planは初期agent packのID・版・審査済みSky Package ID・manifest SHA-256を固定し、pricing snapshot hashへ含める。発行直前に全Packageが現在も`verified`かつ有効reviewであることを照合し、欠落・失効・版違い・manifest改変ならprovider送信前に拒否する。これは候補Packageを注文へ固定するだけで、端末へ導入したりTool実行権限を付与したりしません。`POST /api/esim/orders/{orderId}/reconcile`は既知provider order referenceに対してGET/status/assignmentだけでlocal bindingを再開し、新しい注文を送信しません。`GET /api/esim/orders/{orderId}/status`はowner用の秘匿値を含まない進行状態です。通信会社の実資格情報、pricing assumptionsを置き換える契約見積、checkout前の端末適合、callback inboxの自動worker、`reconciliation_required`でreferenceが不明なtransactionの自動解決は未実装です。`providerDebitEnabled`を明示しないとprovider transactionへ進めず、production設定は存在しません。binding helperをclient入力のowner/orderで公開してはいけません。activation code・Matching ID・SM-DP+は秘密として扱い、DB/ログ/LLMへ渡しません。
- **秘密値**：Webhookにはserver-onlyの`ESIMGO_API_KEY`、32文字以上の独立した`ESIMGO_CALLBACK_DEDUPE_SECRET`、別用途の32文字以上`ESIMGO_PROFILE_HASH_SECRET`が必要です。3値ともGit・ログ・LLMへ置かず、ローテーション時はprofile hash keyの既存binding移行計画も用意します。未設定ならrouteは失敗閉鎖します。
- **端末**：`registerFixtureDevice`の能力値は合成データです。実際のOS受信部による能力確認・所有者登録・更新世代の検証が必要です。eSIMだけで任意端末にOSやアプリを自動導入する権限は得られません。
- **Sky / Zema**：初期packのPackage ID・版・hashと現在のreview状態の照合、および注文snapshotへの固定は実装済み。契約catalog未設定のためLifeline/Developer向け実Packageは未登録。device proof後の利用権有効化、Package導入、個別権限、Zemaへの仕事投入は未接続。追加選択の方針は有料Packageの購入済み扱いや実行許可ではありません。
- **Offline / Lifeline**：署名と1時間のfixture leaseだけを検証しています。この時間は試験用定数で製品料金・利用条件ではありません。オフライン中の即時失効や改ざん耐性のある時計、モデル推論、医療性能を保証しません。最終製品ではLifelineの継続利用方針を別途決め、回線解約でデータやモデルを自動消去しないようにします。

初回のアプリ導入、モデル取得、eSIMプロファイルのダウンロードには端末と通信会社に応じた準備が必要です。完全自動セットアップはOEM等の受信部を含む実機受入が必要です。このfixtureが扱うのはeSIM経路のみで、物理SIM側の販売・配送・有効化を実装したものではありません。OS・モデル全体をeSIMチップに格納する意味でもありません。

## 次の開発

1. provider bundle id・卸上限と、Lifeline/Developer向けの審査済みSky Package ID・manifest hashをserver-owned plan catalogへ固定する。retail price / provider currency / wholesale cap / 初期packを発行時snapshotへ不変保存する。
2. authenticated Sky checkout pathから内部one-shot issue serviceを呼び、本人の注文・再認証・費用cap・provider debit gateを満たす時だけ進める。activation materialは永続DBや通常APIに出さず、対象端末へ短命・本人boundで一度表示する。
3. webhook inboxとprovider GET stateを durable reconcilerへ接続し、順序逆転・再起動・callback欠落・発行結果不明を受け入れる。status照合後も利用権/通信stateを別々に保つ。
4. provider account/sandbox後、契約API v2.5を同一の注文に対してvalidate→transaction→assignment GETとduplicate/timeout/503を試験する。providerへtransactionが一度だけ飛ぶ証拠を保存する。
5. 対象端末に受信部と署名付きinstall proofを実装し、eSIM有効化→本人/端末利用権→初期pack案内→本人が許可したPackage導入→モデル導入→機内モード推論を実測する。
6. クラウドエージェントと従量課金は別の実行・予算台帳へ接続する。

通信会社アカウント、実eSIMの発行、販売・配備、実資金、Android/iOS/OSの導入、モデルAPI呼出しはこの変更では実施していません。

API調査の入口（2026-09-30公式資料確認、implementationはfixture-only）:
[eSIM Go API v2.5 Create orders](https://docs.esim-go.com/api/v2_5/operations/orders/post/) / [Get order](https://docs.esim-go.com/api/v2_5/operations/ordersorderreference/get/) / [Get assignments](https://docs.esim-go.com/api/v2_5/operations/esimsassignments/get/) / [Callback V3](https://docs.esim-go.com/guides/webhooks/) / [1GLOBAL Connect](https://docs.connect.1global.com/static/connect_v1.html)。本fixtureはprovider account、merchant reseller rights、fees、資格情報、live orderを証明しません。

契約前の技術・価格候補比較、eSIM branding/Android direct-install境界、Cloudflare/Cloud Runの運用範囲は[Provider contract readiness](../../docs/provider-contract-readiness-20260930.md)を参照してください。現時点では契約先を確定していません。

## この変更の検証結果

`node --experimental-strip-types --test tests/esim*.test.mjs`は現在59/59成功。raw-body HMAC、署名前parse禁止、body bound、duplicate delivery、numeric ICCIDのprecision保持、ICCID非保存、live/paid・owner・商品version照合、late callback correlation、API v2.5 request/response fixture、transaction dispatchの一回性、timeout stop、read-only order/assignment recovery、catalog更新後の価格snapshot再利用、scheduled batchからのbindingと重複pollなし、reference不明注文の除外、卸値上限超過拒否、server-side retail amount/package mapping、初期Agent Packのexact Package review/hash照合、端末attestation、Worker routeのD1保存と並行登録のidempotencyを検査する。`POST /api/esim/orders/{orderId}/issue`は認証済みownerのpaid Sky orderだけを扱い、bundle・卸値cap・retail amountはserver catalogから選ぶ。catalog version・rate numerator/denominator・fee reserve・minimum margin・provider quoteはcanonical JSON snapshotとSHA-256でorder rowに固定する。Provider debit gateはdefault-off。導入情報はAES-GCM暗号化し、owner/orderとひも付ける。本人認証付きdelivery request keyで応答消失から再取得し、利用者ack後に暗号文を消去する。為替比率とfee reserveは運営が与える設定値で、provider invoiceや決済明細から実証した値ではない。background callback inbox correlation、reference不明transactionの自動解決、Cloudflare production D1/secrets/cron acceptance、実provider署名、credentials、sandbox、実注文、実端末は未受入。GitHubへのpush・main統合は未実施。
