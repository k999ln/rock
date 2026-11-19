# RockstarOS共通サービスの料金・契約・請求を実装する

作成: 2026-10-21。主担当は Wallet / Billing / Providers、task BIL02。製品要望 RQ01〜RQ49 のうち今回の直接対象は BIL02 と SIM01・SKY21 の接続であり、正本は `docs/sky-billing.md#rockstar-monthly-billing-contract`、`docs/workstreams/03-wallet-billing-providers.md`、`data/product-baseline.json`。設計 v1.1 の実装承認は記録済み。**この文書を保存しただけで実装・収納・公開の合格にしない。**

## 出発点と証拠

- 2026-10-21のGitHub読戻し: `main` = `01b6aecd8b4d8bd2385665232dfb4b57029f991f`、`codex/esim-cloud-access` = `951d82d5a491a284aed4e0d4d280171d835d4b43`。ローカルの同branchはmainから652 commit遅れ、独自3 commitがあり、多数の未commit変更がある。mainの新しいRQ50とbranchのRQ01〜49を先に照合する。branchを上書き・強制pushしない。作業直前に両refを再取得しSHAを固定する。`npm run prompt:context`はGitHub接続エラーでexit 2だったため、GitHub APIでbranch・PR・Actionsを別途確認した。
- 同一SHA Actions: mainのRock star verification、SPIDER repair regressions、SPIDER repository security、SPIDER CodeQL securityは全てsuccess。作業branchで確認できたのはPhone source preparation (not OS boot) のsuccessのみ。branchのbilling CI合格を意味しない。このbranchのopen PRは確認できなかった。GitHub PR #142、#144、#145、#146、#150、#159、#160はmainへmerge済み。
- mainにはSky**単独**の月額140 USD／利用枠100 USDのSandbox (`lib/sky-recurring-plan.ts`、`lib/sky-recurring-sandbox.ts`、`lib/sky-hosted-monthly.ts`) がある。`docs/evidence/sky-hosted-monthly.json`は本人限定Stripe SandboxとUIの証拠で`productionBilling=false`。RockstarOS共通の16 USD／契約account月額と混同せず、同じ契約や料金へ黙って移行しない。
- 対象branchの未commit sourceには`lib/sky-linux-service.ts`、`lib/sky-linux-service-store.ts`、`lib/sky-linux-billing.ts`、`lib/rockstar-service-setup*.ts`、`drizzle/0064_sky_linux_service.sql`、`0065_rockstar_service_setup.sql`がある。Linux CPUの含有枠・予約・receipt重複判定・月次Invoice・Stripe Invoice/PaymentIntent/Charge照合・未払い制限/復帰、支払い方法setupと環境準備後起算をfixtureで試験している。`tests/sky-linux-service.test.mjs`、`tests/sky-linux-billing.test.mjs`、`tests/rockstar-service-setup.test.mjs`を読む。Cloud token／Tool実費の共通枠・共通Invoice接続、実Provider sandboxの共通契約一周、本番収納は未受入。既存のCloud価格・予約・署名usage、Wallet台帳とEve jobを調べて接続する。
- `data/project-status.json#monthlyBillingContract20261020`の23件集中試験はlocal/HTTP fixture。2026-10-20の全`npm run verify`は並行変更によるWeb evidence hash、続いて別テストのlintで失敗した記録であり、請求実装の合格でも現checkoutの最新検証でもない。`phaseGates`のB03-PROVIDER、DEVICE-INSTALLはplanned。Pixelの試験署名APK 23/23をOS全体・実請求へ転用しない。

## 実装する結果

契約account一つにつき月額基本料16 USDを一度だけ起算し、合意済み版のAI・Linux枠を一度だけ控除する。本人は申込前にカテゴリ別見積、上限、保存・停止・復帰条件を見て同意し、支払い方法を登録できる。署名済み環境準備と利用権がそろうまでは起算・有料実行を保留する。承認済みjobだけが原子的に予算を予約し、実行中の概算/確定を区別して表示し、上限で追加出力・Tool・再試行を止める。真正なusageだけを一度記帳し、月次明細、Provider Invoice、実入金を照合する。未払いの新規有料実行を制限し、本人データを保持して入金確認後に同じworkspaceへ戻す。

契約・料金の未決値（含有枠の数量/対象meter、超過単価、繰越、日割り、地域/通貨、税区分、決済手数料の負担、締日/支払日、猶予、保持期間、法的文言）はOWNERが版として確定する。未確定のままでも**明示的な合成版のみ**で実装と試験を進め、販売用offer発行、実課金、有料dispatchはfail closedにする。Sky単独140 USD、買切りSky Market、SIM通信料、旧888 cents、ATM手数料0を別契約として維持する。

## 作業順・相違・合格証拠

1. **GAP01 引継ぎと契約版（ROCK/BIL02）**: まず最新mainの正本・Sky単独Sandbox変更を対象branchの引継ぎ入口/優先順位へ同期する。共有dirty差分を一覧化し分離worktreeまたは衝突を避ける方法で必要箇所だけ統合する。`offerId`、`priceVersion`、有効期間、meter別枠/単価、通貨、税/手数料、保存/停止/復帰、契約本文digest、本人同意を不変snapshotとして保存し、既存workspace/Jobには同意済み版を固定する。支払い方法setupと実収納を別状態にする。`serviceStartAt`はeSIM真正性、本人結合、署名済みLinux準備、支払い方法照合の全成立後に一回設定し、同じaccountの子端末では基本料を増やさない。**合格**: 版変更後の旧job再計算なし、準備失敗時0起算、setup時0引落、同account複数端末で基本料1行、別owner拒否をDB fixtureで再現。未決条件は合成版へ明示しproduction flagを閉じる。
2. **GAP02 原子予約とmeter別計量（ROCK＋EXTERNAL）**: 既存`lib/sky-linux-service*`、Cloud価格/予約/usage、A2A/Wallet予約、Eve `lib/workflow.ts`を同じowner・contract・period・job・runへ関連付ける。Cloud input/output/cache token、Linux CPUと対象資源、Tool回数/実費、商品・通信を別lineにする。枠残量＋既存予約＋今回最大見積＋月/job上限を一つのDB原子判定でholdし、上限到達時は次の外部作用を停止する。中間usageが取れない場合は予約額を表示し、確定額へ昇格しない。**合格**: 同時2 job/2端末で枠・上限の二重使用0、事前予約なしdispatch 0、上限到達後追加送信0、取消/timeout/外部結果不明はholdを保持して再照合。Linux local CPUをCloud tokenとして課金しない。
3. **GAP03 receipt・枠控除・月次Invoice（ROCK＋EXTERNAL）**: issuerまたは信頼済み取得経路、owner/契約/job/run/meter/数量/観測期間/料金版/通貨/Provider参照/digestを検証したreceiptだけを追記する。issuer＋receiptId＋runの重複はno-op、同じIDの異なるdigestは隔離。契約timezoneの期間でmeter別確定量を集計し枠を一度だけ控除する。商品、通信、Cloud AI、Linux資源、外部Tool、税、決済手数料は別行。Invoiceはcontract＋periodで一意、版・量・控除・単価・job/receipt参照、異議/訂正履歴を保存し本人明細と問い合わせ入口へ表示。**合格**: 重複/逆順/遅延receipt、月境界、丸め、複数job/端末、未知単価/税、予約未確定、再締めで金額/件数不変。未確定日割り等を勝手に確定しない。
4. **GAP04 Provider照合、収納状態、復帰（ROCK＋EXTERNAL＋JOINT）**: 既存Stripe adapterのidempotency、raw署名Webhook、Provider GET読戻しを再利用する。Provider Invoiceのcustomer/contract/period/currency/税/明細/合計一致を確認してから収納し、Issuer原価Invoiceは別に照合する。`draft/open/payment_pending/paid/past_due/void/refunded/disputed/reconciliation_required`とサービス権限を別状態にする。支払い方法登録、引落要求、Provider成功、実入金を別証拠で記録する。返金/異議は元Invoice・Charge・作者配分へ補正し、外部応答不明で再請求/再送金しない。**合格**: 同一契約のStripe Sandbox一月、失敗/重複/逆順Webhook、partial/full refund、void/dispute、未払いで新規有料実行拒否・読取/export/問い合わせ維持、実入金＋利用権再確認後に同一workspaceへ復帰し無断再送0。Sandbox合格を本番入金へ換算しない。
5. **GAP05 本人にとってスマートな決済（ROCK/BIL02＋UXRS01）**: `docs/sky-billing.md#smart-payment-experience`を受入条件に追加する。最初に`/sky/payments`の既存読取データだけで、支払い方法登録・利用量確認中・同じ請求の照合・異議/返金・保存済み成果への復帰のうち「今必要な一手」を優先表示する。直近100件を全債務と見なさない。次にEveの見積から含有枠と既知の従量/Tool/税/通信額を別行に示し、同一品質・実行先条件で安い候補を提案する。選択、上限変更、支払手段変更、再引落しには明示承認を要し、AI提案が決済権限へ昇格しない。Backendの永続event inbox/定期照合とProvider GET後だけ、同一Invoiceへの安全な再試行・復帰を案内する。**合格**: 画面/再読込で次の操作が同じ、別ownerの明細0、結果不明中の新attempt 0、同一usage二重請求0、本人が契約版→usage→Invoice→支払/返金参照を追跡できる。操作数・復帰時間はpilotで実測し、目標値はOWNERがその後に定める。Sky単独140 USD、共通16 USD、商品、通信、Walletを黙って統合しない。

## 検証と引継ぎ

先に対象テスト（`node --experimental-strip-types --test tests/sky-linux-service.test.mjs tests/sky-linux-billing.test.mjs tests/rockstar-service-setup.test.mjs`）を現在のcheckoutで実行し、変更箇所のDB/HTTP試験を追加する。`npm run billing:check`、`npm run baseline:check`、`npm run design:check`、`npm run project:check`、最後に`npm run verify`を実行する。失敗なら対象path、原因、再現コマンド、修復状況を記録し、別SHAや過去実績を成功にしない。Provider sandbox、実Linux/Pixel、本番は各自の同一artifact evidenceで別gateにする。秘密値と長いログはGit管理外。

着手・判断変更・検証完了時に`project.md`と`data/project-status.json`を更新し、`npm run project:update`でREADMEへ反映する。利用方法の変更はREADME本文も同じ変更に含める。OS component/Sky Tool contractを変える場合は`data/design-document-index.json`と全体/Tool設計を同期する。実装branchでの保存、PR、mainへの統合、実Provider受入を別々に報告する。次担当には残ったGAP、正確なSHA、再開コマンドを渡す。最後にbranchのRQ01〜RQ49とmainの新しいRQ50との矛盾を点検し、RQ12 QEMU、RQ13交換、RQ14作者SDK、RQ15 ATM手数料0、Pixel OS受入、一般公開を請求fixtureの成果へ置換しない。

履歴監査の入力（現在の起点ではない）: main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design `de5b102d3525daccf604efd5685bdf8c14ad5d50`。これは`data/product-baseline.json#auditInputs`との整合用であり、現在のGitHub SHA・CIの代わりに使わない。
