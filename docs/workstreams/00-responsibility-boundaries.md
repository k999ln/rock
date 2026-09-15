# RockstarOS 責任分界

更新日: 2026-09-15

この文書は、RockstarOS側で作るもの、外部Provider／ToBへ任せるもの、本人の操作・判断が必要なものを分ける。外部へ任せても、権限の強制、状態の正確性、receiptの照合、安全な停止はRockstarOS側の責任として残る。

## 担当区分

| 区分       | 意味                                                    | 作業の扱い                                                   |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `ROCK`     | RockstarOSのrepository内だけで実装・検証できる          | 外部待ちにせず進める                                         |
| `EXTERNAL` | Provider、ToB、OS vendor、hardware vendorなどが提供する | 接続契約と受入条件を定義し、相手の実装をRockの完了に数えない |
| `JOINT`    | Rockのadapterと外部sandbox／実環境の両方が必要          | 両側の同一条件でend-to-end証拠を取る                         |
| `OWNER`    | 本人の署名、契約、支払い、公開、端末操作などが必要      | AIや外部Providerが代理決定しない                             |

## 分野別の責任

| 分野                 | RockstarOS側で行う                                                     | 外部へ任せる                                                         | 本人が行う／決める                             | 統合完了の証拠                                           |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Product / UX         | Home、Sky、Chat、Wallet、設定、状態表示、accessibility、復旧導線       | ToB商品の説明、品質、保守情報                                        | 対象利用者、優先課題、最終的な製品判断         | 初見操作、失敗復旧、再利用の実測                         |
| Sky / MCP            | registry、Connection Passport、権限差分、一回承認、実行、停止、receipt | MCP server、OAuth、Tool schema、稼働率、商品固有処理                 | 接続先選択、scope同意、変更系Toolの実行承認    | sandboxでinitializeから結果照合・失効まで完走            |
| 自動化商品           | 共通package、審査、隔離、resource制限、状態遷移                        | ToBが商品ロジック、価格、license、supportを提供                      | 導入、入力、費用上限、実行の承認               | 作者・版・権限・成果物をreceiptで追跡可能                |
| Wallet / Billing     | 本人別台帳、予約、確定、取消、重複防止、Earning Receipt、fee policy    | 決済、custody、KYC、払出し、返金、chargeback、為替、税務処理         | 受取Wallet署名、最初の実transfer、Provider契約 | Provider入金から台帳・fee・払出しまでexact照合           |
| Security / Identity  | least privilege、秘密非保管、auth境界、監査、SBOM、fail-closed検査     | IdP、OAuth issuer、HSM／custody、第三者監査、法務意見                | 製品license、鍵管理方式、個人情報機能の有効化  | 独立したsecurity／legal gateと同一候補の証拠             |
| Web / PWA / Sites    | source、D1 migration、build、PWA、security header、asset closure       | Hosting基盤、認証サービス、DNS／証明書基盤                           | 配備、一般公開、外部visitor許可                | Git SHA、build SHA、Sites version、実responseが一致      |
| Native / QEMU        | OS core、Platform API、package、更新、rollback、backup、診断           | Buildroot等の上流componentと各license条件                            | production署名、release公開                    | 同じarchive SHAでfresh導入から削除まで完走               |
| Android / Device     | Rock共通service、Android接続層、Device Support Package契約、受入script | AOSP／GrapheneOS、OEM BSP、vendor driver、firmware、CTS、必要時のGMS | 対象機種／SKU、unlock、flash、鍵、販売地域     | 同じ実機・buildでboot、hardware、OTA、rollback、純正復旧 |
| Local AI             | Binder API、Tool allowlist、確認、timeout、resource上限、監査          | 推論runtime、upstream app、GGUF／model、model license                | 使用model、端末への導入、外部送信可否          | airplane mode、変更系確認、熱・RAM・連続稼働の実測       |
| Game / Market / Fund | SDK、adapter、owner分離、exact approval、PAPER台帳、risk表示           | ゲームserver、market data、注文／清算Provider                        | ゲーム、通貨、rate、取引方向、LIVE利用の承認   | sandboxの両台帳一致と取消・再送・二重使用拒否            |
| Business Pilots      | CSV処理、仕事状態、私有成果物、retention、検査、収益照合入口           | Marketplace、決済、配送、Meta等の業務API                             | 出品、顧客連絡、入金確認、納品、返金対応       | 第三者取引を検収・Provider入金まで追跡                   |
| Git / CI / Release   | branch整理、CI、証拠、version、migration互換、復旧手順                 | GitHub／Sitesのサービス提供                                          | main merge、公開release、課金を伴う環境契約    | clean tree、同一SHA CI、配備readback                     |

## RockstarOS側に必ず残すもの

次は外部Providerへ委譲しない。

- 利用者へ表示する接続状態、費用状態、結果状態の正確性。
- 権限、scope、実行先、費用上限、変更系操作の本人承認。
- job、receipt、provider reference、台帳のidempotencyと競合拒否。
- timeout、切断、結果不明、取消、失効、再起動後の安全な復旧。
- Providerの申告をそのまま確定扱いせず、署名、schema、金額、時刻、finalityを照合する処理。
- 実装、fixture、sandbox、実機、本番を区別する進捗表示。

## 外部へ任せるべきもの

RockstarOS自身が抱え込まない。

- 利用者資産のcustody、任意送金、法定通貨決済、KYC、税務判断、chargeback処理。
- 外部市場での注文、清算、配送、出品規約、顧客との契約履行。
- ToB商品の固有ロジック、価格、品質保証、保守、知的財産。
- OAuth identity、外部MCPの可用性、model API、cloud computeの供給。
- OEM固有BSP、driver、firmware、無線認証、GMS license。
- 独立した法務、security、license、規制適合の専門判断。

## 共同作業の段階

外部接続は次の段階で管理する。`ROCK_READY`だけを製品利用可能と表示しない。

1. `ROCK_READY`: adapter、UI、安全境界、fixture testが完成。
2. `PROVIDER_READY`: 契約、sandbox、資格情報、schema、責任者が確定。
3. `INTEGRATED`: sandboxで正常系と異常系をend-to-end受入。
4. `LIMITED_LIVE`: 本人承認済みの限定対象で最初の実処理を照合。
5. `PRODUCTION`: 監視、support、失効、返金／復旧、法務条件まで運用受入。

## taskへ記録する項目

新しいtaskまたは既存taskの更新時は、最低限次を残す。

- `primaryOwner`: `ROCK` / `EXTERNAL` / `JOINT` / `OWNER`
- `rockDeliverable`: repository内で完成させるもの
- `externalDependency`: Provider名、API、hardware、契約。なければ`none`
- `ownerAction`: 本人の署名、契約、公開、支払い、端末操作。なければ`none`
- `acceptanceEvidence`: 合格を判断するcommand、receipt、readback、実機記録
- `currentStage`: 上記5段階のどこか

現在の `data/project-status.json` は既存task schemaを使用しているため、このmetadataの一括追加はschema、同期script、既存97 taskを同じ変更単位で更新できるときに行う。それまでは各workstream文書とtask本文で責任を明記する。
