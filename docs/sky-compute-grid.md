# Sky Compute Grid — 使われていない携帯を束ねるVirtual Compute Plant

更新: 2026-10-10 ／ task: `GRID01` ／ owner: ROCK（O5 Sky・Zema・Wallet、O6 Device Adapter連携）

## 1. 目的と利用者

Sky Compute Gridは、世界中の **充電中・未使用・unmetered network接続中のAndroid端末**を、短く中断可能な計算ロットの供給源として束ねる。買い手は個々の端末を借りるのではなく、期限・地域・信頼度・価格上限を指定した`ComputeOrder`を出し、Sky Matcherが適合する`CapacityOffer`へ割り当てる。

電力網との対応は次のとおり。

| 電力網 | Compute Grid |
| --- | --- |
| 家庭の太陽光・蓄電池 | Android端末の余剰計算能力 |
| 発電余力の入札 | `CapacityOffer` |
| 電力需要 | `ComputeOrder` |
| 系統運用者 | Sky Matcher |
| 給電指令 | `ComputeLease` |
| 電力量計 | verified Compute Lot / usage receipt |
| 売電精算 | Walletへ渡す検証済み精算候補 |

対象利用者は、可用性より価格と分散性を優先できるbatch計算の買い手と、自分の端末を使わない時間だけ明示的に提供したい所有者である。汎用cloud server、常時稼働API、低遅延推論、秘密data処理の代替とは扱わない。

## 2. End-to-end体験

1. 端末所有者は、提供時間、粗い地域、固定runtime/modelのhash、速度、最低単価、data class、温度・通信・電池上限を提示する。
2. 買い手は、固定SKU、入力lot hash、期限、地域、最低trust tier、単価上限、総予算、検証方式を指定する。
3. Matcherは互換性をhard filterし、価格、完了確率、benchmark、地域、trustで候補を並べる。
4. Skyは10分以内の有限`ComputeLease`を発行する。leaseは固定artifactとlotだけを含み、任意codeや買い手の秘密を含めない。
5. Android workerは充電・idle・unmetered・温度を再検査し、ownerが端末を使い始めたら停止して未完lotを戻す。
6. 結果は入力・出力・runtime/model/tokenizer hash、時刻、端末安全条件を持つ`ComputeReceipt`として返す。
7. 中央の独立参照計算、または別leaseのduplicate quorumで各lotを検証する。
8. 合格lotだけをusage receiptへし、同じreceiptから一意なsettlement idempotency keyを作る。現在は`sky_test_credits`のhold previewまでで、Wallet書込みとlive payoutは行わない。

買い手へ表示するのはcoarse region、capability、trust tier、価格、完了見込み、pseudonymだけである。所有者の本人情報、端末固有ID、正確な位置は表示しない。

## 3. 責任と禁止authority

| component | 責任 | 禁止 |
| --- | --- | --- |
| Android worker | 端末状態の測定、固定runtimeの実行、協調停止、receipt署名候補 | 任意APK/codeの取得、個人dataの送信、Wallet記帳 |
| Sky Matcher | hard filter、score、有限lease、budget予約候補 | offer条件の緩和、地域越境、無断cloud fallback |
| Result Verifier | schema/hash/参照出力/duplicateの照合 | workerの自己申告だけで合格にすること |
| Wallet adapter | verified usageを冪等な精算候補へ変換 | 未検証結果の収益化、現行料金holdの解除 |
| Buyer | data class、地域、期限、上限、検証方法の指定 | 個人情報・秘密・違法data・任意codeの投入 |
| Owner | 提供のon/off、時間、熱・通信・data・価格条件 | 他ownerや買い手の情報へのアクセス |

Sky Compute Gridは既存AI05のauthority deviceを自動で移す仕組みではない。AI05はowner自身の仕事を一台のauthority deviceへ固定する。Gridは公開・合成dataの独立したinterruptible lotだけを、匿名化された供給端末へ配る。

## 4. 入出力・ID・版・上限

正本schemaは[`contracts/sky-compute-grid.json`](../contracts/sky-compute-grid.json)。host実装は[`lib/sky-compute-grid.ts`](../lib/sky-compute-grid.ts)。

- `CapacityOffer` (`sky-capacity-offer/1`): Android arm64、粗いregion、provider ref hash、pseudonym、artifact hashes、memory、benchmark、reliability、window、max lots、test-credit単価、data policy、現在条件。
- `ComputeOrder` (`sky-compute-order/1`): `public-text-embedding-v1`だけ。public/synthetic data、artifact hashes、region、trust、memory、lot size、単価・総予算、deadline、検証方法、入力hash。
- `ComputeLease` (`sky-compute-lease/1`): 最大10分、order/offerへ固定。charging、idle、unmetered、thermal `light`以下、owner useで停止、arbitrary code禁止。
- `ComputeReceipt` (`sky-compute-receipt/1`): lease/order/offer/artifactへ固定し、lotごとのinput/output hashとdevice conditionを持つ。
- settlement preview (`sky-compute-settlement-preview/1`): `service_credit_hold`、`livePayoutAuthorized=false`、`walletMutationAllowed=false`。

初期lotは1,000件相当の公開または合成UTF-8 text embeddingを想定するが、ワイヤー上は入力bytesとhashで固定する。CPU時間ではなく **検証済みlot**で単価を付ける。遅い端末ほど多く稼げる逆インセンティブを作らないためである。

## 5. 状態と失敗遷移

```text
offer_available
  └─ hard_filter_passed
       └─ lease_issued
            ├─ completed → receipt_received → verified → settlement_candidate
            ├─ owner_active / thermal / metered → interrupted → lot_requeued
            ├─ lease_expired → expired → lot_requeued
            ├─ invalid_receipt → rejected → reputation_event
            └─ result_unknown → held_for_reconciliation（自動精算しない）
```

orderは`matched | partial | unmatched`を返す。条件を満たさないofferには機械可読理由を残す。budgetが足りない場合は割り当てられる分だけ`partial`にし、上限を超えて予約しない。

## 6. 保存・保持・削除・backup

host fixtureは永続保存しない。本番候補では次を別table／権限へ分ける。

- public market view: pseudonym、coarse region、capability、価格、availabilityだけ。
- private provider binding: owner account、端末attestation、provider ref hash。buyerへ返さない。
- order/lease/receipt: owner/buyer scope、artifact hashes、lot hashes、state、期限、金額。
- input/output artifacts: object storageへ暗号化し、leaseには短期取得権だけを渡す。個人情報・秘密を受け付けない。
- accounting: verified usage receiptとsettlement idempotency key。元data本文をWalletへ渡さない。

保持期間、削除SLA、法令上の会計保持、backup/restoreの具体値は本番前の未決事項。削除しても既に成立した会計receiptを改変せず、本文artifactとpublic offerは切り離して削除できる構造にする。

## 7. Offline・retry・重複・結果不明

- lease取得前の通信切れは実行しない。
- lease中の通信切れは端末内の固定lotだけを期限まで続けられるが、期限後の結果は拒否する。
- 未完lotは同じlease内で勝手に成功扱いせず、lease失効後に新leaseへ再配置する。
- receipt IDとsettlement keyは内容から決定的に作り、同じ内容の再送を冪等にする。異内容の同一IDは拒否する。
- 外部作用を伴うworkloadは初期SKUに入れない。embedding lotは同じ入力・版なら再計算できる。
- timeout後に結果が不明なlotは、検証または不在確認まで精算しない。再配置する場合もduplicateを許容する計算として扱い、二重精算を防ぐ。

## 8. 更新・互換性・rollback・復旧

runtime、model、tokenizerはSHA-256完全一致でleaseへ固定する。いずれかが変われば別versionのSKUとして扱い、進行中leaseを移行しない。matcher／verifierの更新は、保存済みfixture、旧receipt、期限、重複、改変、部分一致の回帰を通す。

新matcherに問題があれば新規leaseを止め、既存leaseは旧versionの検証器で期限まで照合する。Android worker更新時も、配布済みleaseのartifact hashが端末runtimeと一致しなければ実行せず返却する。端末交換や自動cloud fallbackで仕事の実行先・費用・data境界を黙って変えない。

## 9. 安全・privacy・security・外部承認

- Android supplyだけを初期対象にする。iOSは買い手UI・結果確認だけにし、background供給を約束しない。
- charging、device idle、unmetered network、thermal `light`以下を開始・継続条件にする。owner操作を最優先し、停止を収益より優先する。
- Play配布を前提に、downloaded executable code、DEX/JAR/native library、shell、root、Accessibilityによる迂回を許可しない。審査済み固定runtimeへdataとbounded parameterだけを渡す。
- public/synthetic dataだけ。個人情報、秘密、credential、会話、写真、正確な位置は拒否する。
- attestationはdevice/app integrityの一要素であり、計算結果の正しさを証明しない。結果は独立参照またはduplicate quorumで別に検証する。
- regionはdata residencyの代替証明ではない。本番の越境要件は契約・storage・routingの別受入を必要とする。
- 供給on、料金条件、通信使用、発熱上限、夜間windowはownerが明示設定する。OSの電池最適化を迂回しない。
- 実課金・払出し、税務、労働・通信・消費者法、盗難端末、bot farm、Sybil対策は法務・Provider・OWNERの個別承認前に有効化しない。

## 10. 受入環境と証拠

2026-10-10の実装範囲は **synthetic host fixture**。

- fixture: [`contracts/sky-compute-grid-fixture.json`](../contracts/sky-compute-grid-fixture.json)
- tests: [`tests/sky-compute-grid.test.mjs`](../tests/sky-compute-grid.test.mjs)
- demo API: `GET /api/sky/compute-grid/demo`
- demo UI: `/sky/compute-grid`

host fixtureで受け入れるのは、固定SKU、hard filter、score、lot割当、有限lease、artifact binding、独立参照／duplicate検証、未検証精算拒否、test-credit hold、privacy境界である。Android worker、ネットワークcluster、real attestation、production storage、実需要、実料金、実払出し、性能・電力・熱・端末寿命は未受入。

次の物理MVPは日本、同系統Pixel/Android 50台、買い手3社以下、1 SKU・1 runtime・1 model、public/synthetic data、中央matcher/verifier、service credit限定とする。目標は期限内verified 95%以上、false accept・二重精算・温度/電池違反・data事故0、比較cloud比総費用25%以上低いこと、4週後provider継続50%、買い手3社中2社が4週間repeatすること。数値は仮説であり、達成済み表示をしない。

## 11. 未決事項・decision owner・判定方法

| 未決 | owner | 決めるための試験 |
| --- | --- | --- |
| 最初のanchor buyerと許可dataset | OWNER / Sales / Legal | 実需要3件のdata分類・期限・単価を比較 |
| 1 lotの正確な文書数・token数・reference Pixel時間 | O6 / O5 | 50台pilot前の同一端末benchmark |
| verification率とduplicate比率 | Security / O5 | 改変worker・遅延・誤出力を含むred-team |
| provider creditとbuyer price、Sky spread | OWNER / O5 | 全費用（検証・retry・egress・support）込みunit economics |
| attestation providerと失効運用 | Security / O6 | Play Integrity／hardware keyのdevice acceptance |
| 税・利用規約・端末所有者の扱い | Legal / OWNER | 日本pilotの契約・会計review |
| production Wallet rail | OWNER / Wallet | sandbox精算、返金、chargeback、初回限定live受入 |
| retired phone rackをfirm reserveにするか | O6 / OWNER | live phoneとの熱・電力・故障・稼働率比較 |

最大の事業riskは、検証、再計算、通信、fraud、supportを含めるとcloudより高くなること。供給者数を先に増やさず、anchor demandと1 SKUのunit economicsを先に閉じる。
