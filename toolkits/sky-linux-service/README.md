# Sky Linux 16

月額16 USDに一定のAI・Linux利用枠を含み、対象枠の超過分だけを従量課金する初期プラン。枠の量・対象・超過単価は未確定です。Sky Market → `/sky/linux` で作者のモデル/Agent登録、審査、利用者の契約/Add/依頼/成果/明細/持出しを扱う実装です。運用者管理の専用Linuxが計測するCPU時間と、成功したAgentの表示利用料を月次で集計します。未払い・eSIM利用権失効で新規実行とlease更新を拒否し、データは保持します。

**source/local fixtureの段階です。実eSIM、管理Linuxの実隔離と実計測、Stripe sandbox、実送金、chain公開は未合格です。** Pixelの既存本人用Linuxの試験は別経路。実行adapterは固定worker/対応GGUFの文章処理で、Cloud LLMと任意作者コードの統合は未完了です。

## 既存システムとの接続

- 作者は既存StudioのPackageを登録/公開/審査後、`POST /api/sky/linux` の`register`へ追加定義を渡します。`model`は既存`sky.local-model/1`、`agent`は`name/instructions/modelId`、`authorFeeMinor`はUSD cents、`packageKey/packageSha256`は自分の審査済みPackageです。新しい`id`ごとに版を固定します。
- 追加定義も既存`requestSkyReviewer`の資格で`POST /api/sky/linux/reviews`に`listingId/digest/decision=approved|revoked/expiresAt`を渡して審査します。元Packageと追加定義の両方の審査が有効な時だけ利用可能です。署名/審査を万能な安全性保証と表示しません。
- 電子契約は料金版と本人/端末/eSIM注文、受諾時刻をdigestへ固定します。eSIM購入/導入grantと現issuer状態を両方照合します。現在の有効状態を導入済み表示やIPアドレスから推測しません。
- 仕事は既存workflowのrecord/review/complete/cancelを使い、Eveの`work_jobs`と同一D1 transactionで保存します。一般のwork APIから管理仕事の結果を書き換えられません。
- 請求は既存Stripe transportを使うBilling Invoice、入金はInvoicePayment→Intent→Chargeの読戻し、作者口座は既存Commerce sellerを再利用します。送金前にv2のrecipient transfer能力を再確認します。既存別商品のCheckoutや旧Wallet料金は変更しません。

## 設定

### Pixelの利用開始module（OS受入後に有効化）

`/connect/service` と `lib/rockstar-service-setup*.ts` が、確認済みeSIM/端末利用権→料金提示→契約・継続課金の二つの同意→Stripe支払い方法登録→既存Linux workspace→署名workerの準備証拠→Sky/Eveの導線を管理します。Checkoutは`mode=setup`で登録時の引落は0。支払い方法登録と月末Invoiceの入金確認は別です。準備前のworkspaceには`serviceStartAt=null`を保存し、基本料の起算と新規実行を開始しません。

既定では`ROCKSTAR_SERVICE_SETUP_ENABLED`は無効。OSが実際に受け入れられるまで、`ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON`をacceptedに変更しません。記録形式と未完了条件は`data/service-setup-integration.json`と[正本](../../docs/sim-led-product-architecture.md#pixel-service-setup)を参照。Android側も`rockstar_service_setup_enabled=false`、接続originは空で、Gradle/Soong共通resourceを製品overlayで設定します。署名caller限定の`ServiceSetupActivity`によるeSIM追加成功は端末側の結果だけであり、issuer/端末の強い導入証拠を代替しません。

既存workerは準備challengeを取得し、`setup-probe.py`でモデル/runtime hash、私有保存とnamespace隔離を確認し、固定されたreportのdigestを署名した`setup-ready`として返します。これは推論や実機の受入結果ではありません。受入後も現在のissuer状態と未払いを再照合します。OS受入→許可済み実profile→Stripe sandbox→管理Linux→同一Pixelの一周・失効/復帰の順で検証し、fixtureを実利用済みへ昇格させません。新規試験は`node --experimental-strip-types --test tests/rockstar-service-setup.test.mjs`です。

最初のプランは16 USDのみ。`SKY_LINUX_SERVICE_TERMS_JSON`には`schema:sky.linux-terms/1,version,currency:USD,baseMinor:1600,cpuUnitMs,cpuUnitMinor,includedCpuMs,monthlyCapMinor,graceDays,leaseSeconds,retentionDays,termsUrl`を設定します。単価・無料量・上限・猶予・保持は未決定なので本番値を入れていません。既定でservice/billingの両gateを閉じます。

`SKY_LINUX_SERVICE_ENABLED=true`にする前に、既存`ESIM_CLOUD_ACCESS_POLICIES_JSON`等の導入grantと、現在のissuer状態の契約adapterを受け入れてください。`SKY_LINUX_EVENT_KEYS_JSON`はEd25519 SPKI公開鍵の配列で、`id,role(issuer/worker/collection/payment/transfer),mode,publicKey`を持ち、worker鍵は`ownerId/workspaceId`を必須にします。署名本体は`sky.linux-event-signature/1:<mode>:<JSON.stringify(event)>`、eventは`schema:sky.linux-event/1,id,workspaceId,issuedAt,kind,payload`。個人データ/鍵はGitへ入れません。issuerのpayloadは`orderId,deviceRef,sequence,state,validUntil`で、active証拠の有効期間は最大24時間です。

`SKY_LINUX_BILLING_ENABLED=true`には既存`SKY_PAYMENTS_MODE,SKY_STRIPE_SECRET_KEY,SKY_STRIPE_WEBHOOK_SECRET,SKY_PAYMENT_ORIGIN`とserver-only `SKY_LINUX_CUSTOMERS_JSON`（本人ID→Stripe Customer ID）が必要です。restricted keyを使い、先にsandboxで受け入れます。`/api/sky/linux/payments`への署名Webhookは必須。APIで`collect/reconcile`を呼べますが、利用者の金額や作者IDは受け取りません。税・販売地域・登録を確定してから税設定を有効化します。

請求月はUTC。最初/最後の月は確認済みのeSIM有効期間を秒で按分し、全月有効なら基本料16 USDです。CPUはuser+systemの実子process時間です。月額に含む月内CPU利用枠を差し引き、料金単位の端数を最終centで切上げます。月間上限には基本料と実行中の最悪予約額を含めます。成功したAgent利用料の作者分は既存10%手数料控除後。CPU費/基本料へ作者手数料を重ねません。試験用の数値を本番の価格として扱いません。

## 管理Linux worker

一workspaceに専用OS userと保存領域を割り当てます。NodeとPython、bubblewrap、既存`toolkits/sky-linux-local`の固定runtime/modelとhash lockを`~/sky-private`へ受け入れます。現在の固定配布物はARM64向けです。GPU/RAM/全機種/常時稼働は別受入です。

`SKY_LINUX_BROKER_ORIGIN`（exact HTTPS origin）、`SKY_LINUX_WORKSPACE_ID`、`SKY_LINUX_WORKER_KEY_ID`、`SKY_LINUX_WORKER_KEY_FILE`を専用userへ設定し、`node toolkits/sky-linux-service/worker.mjs`で一件だけclaim/実行します。秘密鍵はGit外で0600保存、worker user以外から読めないようにします。モデル子processへ鍵/他の仕事/host homeを渡さず、bubblewrapで選択runtime/model/promptとsystem libraryだけをread-only公開し、ネットワークを外します。namespaceが使えなければ失敗し、無制限実行しません。加えてOSサービス側のMemoryMax/TasksMax/CPUQuota/patch/backup/monitoringを受け入れてください。

lease中も署名heartbeatで利用権を照合します。失効/通信断では固定workerの実PID/boot/開始時刻を照合して止めます。送信した最終receiptは`~/sky-private/service-outbox`へ保持し、応答消失時は同じreceiptを照合します。モデルを再実行して補いません。署名requestの`close-month`は終了済み月を締めます。未確定仕事がある月は締めません。月締め・収納・照合のcontrollerソースは`services/sky-linux-service/src/worker.ts`、設定例は同ディレクトリの`wrangler.example.jsonc`です。日次で前月までを処理し、未確定の仕事/入金/送金は保留します。両gateは既定無効で、timer/controllerは未配備です。

## 電子契約とチェーン証明

画面から電子契約・salt・digest・commitmentを持ち出せます。`SHA256('sky.linux-proof/1:'+salt+':'+contractDigest)`だけを`contracts/SkyAgreementProof.sol`へanchorするソースを用意しています。個人情報/利用内容/契約本文をchainへ載せません。チェーン・address・Wallet・transactionは未指定/未公開で、オンチェーン送金やアクセス制御は行いません。電子契約の法域・法的効力の確認は別の受入です。

## 検証と再開

`node --experimental-strip-types --test tests/sky-linux-service.test.mjs tests/sky-linux-billing.test.mjs`

`npm run typecheck` / `npm run design:check` / `npm run schema:check` / `npm run verify`

集中試験は合成使用量とStripe HTTP mock、SQLiteでのowner分離/原子的保存です。実Linuxの隔離/CPU計測、issuerの通知/失効、実カード/銀行の収納・作者送金・返金/異議は同一契約でsandbox受入してください。大量modelのhosting、HF規模の検索/公開Hub、モデル品質評価、自動スケール/GPUs、Cloudモデルadapter、productionは残っています。次の入口は`docs/prompts/sky-linux-marketplace-next.md`、証拠は`docs/evidence/sky-linux-service.json`です。
