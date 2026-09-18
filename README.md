# RockstarOS — 自動化を接続・実行・管理するOS

RockstarOSは、交換可能な高性能ローカルLLMとoffline agent runtimeを中核にするAIネイティブOSとして開発しています。SkyとZemaを最初の第一者systemとし、仕事・生活を便利にする自動化、Wallet／ファンド、ゲーム、IP／動画に加え、物質・配合・工程条件から検証可能な発明候補を作るMaterial Invention Coreを共通基盤へ接続します。その標準製品体験が、四方向sensorとhand interactionで物質digital twinを操作し、再計算とPatent AI支援へつなぐRockstarOS端末`avocadoMini`です。製品要望の正本は [製品ベース](docs/product-baseline.md) のRQ01〜RQ49、具体的な契約と実装順は[AIネイティブOS詳細設計](docs/ai-native-os-architecture.md)、物質発明は[Material Invention Core設計](docs/material-invention-core.md)、独立監査は[Sol設計監査](docs/ai-native-os-design-audit.md)、全層の組合せと未接続点は[全体構成監査](docs/system-composition.md)、進捗の正本は [data/project-status.json](data/project-status.json) です。内部識別子は互換性のため`dev.rock`で固定し、既存の`rockstaros-*`形式と`/rockstaros` URLは変更しません。現在版は`RockstarOS 1.0 Developer Preview`で、版表示は[data/product-identity.json](data/product-identity.json)から一元管理します。

## 現在地

<!-- project-overview:start -->
更新日: 2026-09-18 / 120 task中81 done・22 in progress・16 planned・1 blocked
<!-- project-overview:end -->

| 対象            | 現在できていること                                                                           | 現在の判定                             | 主な残件                                                           |
| --------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Web / PWA       | Home、Sky、Zema、仕事、CSV、Wallet、Market、設定、Studio、D1 API                             | 実装あり・本人限定Siteの最新版同期待ち | 同一sourceの配備、認証後の実操作、一般公開gate                     |
| Linux / QEMU    | OS起動、Platform API、専用UID、SQLite、保存、A/B更新、rollback、backup、Wallet／Game fixture | Developer Preview候補は10 gate中6合格  | 製品license、production署名、署名後の同一候補受入、公開承認        |
| Android P1      | Broker／Shell／Tool、Local AI plan v2、native Sky永続化、emulator backup v2復元            | 試験署名Pixel非破壊23/23受入済み        | 物理wipe復元、汎用Core、OS full build                              |
| Android物理端末 | Pixel 10 GL066固定、署名source／partition構成、初回flash方針、7項目のproduction構成           | 6必須gate中1合格                       | BSP、full build、SELinux、CTS/VTS、OTA、純正復旧                  |
| Local AI        | 固定runtime、API v2、Qwen機内モード、2工程Tool・再起動、33分実機熱試験                    | 単体実機合格・OS image未搭載           | model交換・共通記憶、専用SELinux、production署名、同一build再受入 |
| Wallet / 実資金 | 本人別台帳、Earning Receipt、月最大8.88 USD精算、Base USDC照合コード                         | sandbox／コード段階                    | owner署名、最初の実transfer、決済・払出しProvider受入              |

結論として、**Web/PWAとQEMUの開発版は動く範囲がありますが、スマートフォンへ書き込んで日常利用できる完成OS、本番金融、一般公開版は未完成です。** QEMU、Android emulator、物理端末、本番環境の成功は相互に代用しません。

## 現在仕様

- **Home**: Sky、Zema、Wallet、Market、Settingsへの標準入口。仕事はZema、CSVはSky内のToolとして開きます。
- **Sky**: Toolの発見、作者・版・権限・料金・実行先の確認と接続を担当し、選んだToolと依頼をZemaへ安全に引き継ぎます。
- **Zema**: 接続済みToolへの依頼、追加確認、方向修正、承認、処理状態、結果、仕事履歴を一つの会話にまとめます。
- **MCP**: stdio／Streamable HTTPをConnection Passportで管理します。現在の標準実接続は「このPC」で、Sky Cloudとprovider MCPは準備中です。
- **Wallet**: 仕事、費用、検証済み収益、Rock利用料、払出しを別状態とreceiptで管理します。売上0なら請求0、未達分の債務化・翌月繰越はありません。
- **Market / Fund**: 型付き価値の市場と実績更新型ファンドはPAPER限定です。LIVE注文、清算、自動再投資は無効です。
- **Material Invention / avocadoMini**: Material Invention Coreの標準体験。四方向sensorで手を追跡し、物質digital twinの接続・分離から候補再計算とPatent AI引継ぎを行うRockstarOS端末を設計済み。XR runtimeと実機は未実装です。
- **OS運用**: 診断、暗号化された端末設定backup、明示的なPWA更新、A/B更新、rollback、復旧を提供します。
- **緊急保護**: 利用者向けOSとは別配備の`RockstarOS Operator Dock`と、launcher非表示・別UIDの`dev.rock.operator.agent`を実装しました。DockはCloudflare Access JWTと利用者確認済みWebAuthn署名を必須化し、Agentは対象端末、RP／origin、署名、期限、scope、単調増加counterを独立検証してからackします。端末requestもKeystore P-256鍵で署名し、端末監査はAndroid Keystore HMAC chainで追記します。管理serverだけでは有効命令を作れず、任意shell、私的内容、Wallet、鍵への経路はありません。source build／lint、Android 15 emulator、試験署名Pixelの命令検証5/5は合格。production credential、StrongBox attestation、Device Owner実行、本番の侵入／復旧演習は未完了です。
- **Android正式署名**: 専用オフライン署名PC、YubiHSM 2本番1台、別場所の予備1台、別端末での独立検証に固定し、鍵をAVB／OTA／system application／APEX system componentの4系統へ分離しました。長期鍵と通常application鍵24か月目安、最低1 releaseの旧新鍵移行、漏洩鍵の即時停止・再使用禁止も固定済みです。生の秘密鍵はHSM外へ出さず、端末診断プラグインを署名鍵やboot不能の復旧手段には使いません。機材調達、全署名接続、予備切替、旧新鍵移行、Pixel 10実測は未完了です。
- **Android rollback防止**: RockstarOS管理indexは署名前に固定した正式releaseのUTC Unix秒を使い、Google管理値は変更しません。A/Bのtrial slotでは端末indexを進めず、起動成功後だけ確定します。正確なlocation/value、失敗fallback、古い署名済みimage拒否はfull buildとPixel 10実機試験待ちです。
- **Pixel 10純正復旧**: firmware freeze時点のGoogle公式最新安定版を選び、factory imageとfull OTAを同一buildで揃えます。full OTAは非wipe復旧と両slot boot可能化、factory imageはwipeを伴う最終復旧に限定します。利用条件同意、実ファイル取得、byte数・SHA-256固定は未完了です。
- **Business Pilot**: CSV整形、メルカリ販売支援、Fashion Brand Opsを実装しています。外部市場の取引や売上を自動で実績化しません。
- **Android production構成**: `dev.rock.automation`をheadless Platform Brokerとして維持し、最終Home／Sky／Zemaを載せるAndroid UI入口を、通信・DB・Keystore・広い管理権限を持たない`dev.rock.shell`へ分離しました。Shell API v4はnative Sky選択をBroker SQLite schema v2へ保存し、所有者24単語backup v2のexport／transactional import／新Keystore再bindingもBrokerだけで処理します。復元後は停止、token rotate、active承認停止、component authority除外を強制します。Local AI plan-only API v2はJSON Schemaで出力を制約し、Brokerが選択Toolと実行可能入力を再検証します。emulatorではBroker 11 non-skipped／Shell 5 test、所有Pixelは実再起動を含む23項目が合格しました。物理data／Keystore全損復元、Soong image、SELinux enforcingは未完了です。[Platform Core](docs/platform-core.md)／[backup証拠](docs/evidence/android-backup-v2-emulator-20260916.json)／[物理23項目の証拠](docs/evidence/android-pixel-10-prefull-physical-20260916.json)。

## 設計方針

1. Rock側は接続、権限、実行管理、停止、receipt、台帳、復旧を共通基盤として作ります。
2. ToBは商品固有ロジック、価格、license、品質、保守を担当します。
3. 決済、custody、KYC、税務、外部市場、OEM固有driverなどは交換可能な外部Providerへ分離します。
4. 外部へ任せても、権限強制、状態表示、照合、失効、結果不明時の安全性はRock側に残します。
5. 実装、fixture、sandbox、QEMU、emulator、物理端末、本番を別gateで判定します。
6. 秘密鍵、seed phrase、包括送金権限、任意shell/rootを共通機能として保持しません。

詳細は [責任分界](docs/workstreams/00-responsibility-boundaries.md)、[全体構成監査](docs/system-composition.md)、[1.0構成](docs/rockstaros-1.0-architecture.md)、[1.0戦略](docs/rockstaros-1.0-strategy.md) を参照してください。

## 作業の入口

設計書は [作業ストリーム案内](docs/workstreams/README.md) から次の区分で確認できます。

- Product / UX
- Sky / MCP
- Wallet / Billing / Providers
- Security / Identity / Compliance
- Web / PWA / Sites
- Native / QEMU / Release
- Android / Device / Local AI
- Game / Market / Fund
- Business Pilots
- Git / CI / Operations

各ストリームには、現在地、担当、外部依存、次の順番、完了条件、関連設計書、検証コマンドがあります。

## 次に進める作業

### 直近のrepository作業

1. 最短ローンチ対象を `Web / PWA 本人限定Preview` に固定し、現在差分を機能単位で整理する。
2. 対象試験、`npm run project:update`、`npm run verify`を完走し、設計・進捗・コードを同じcommitへ固定してGitHubへ保存する。
3. ownerの最新版同期承認後、その同じSHAを本人限定Sitesへ配備し、認証後の主要導線、API、security header、D1 migrationをreadbackする。

### OS完成へ向けた順番

1. **端末内価値loop**: 接続を戻したstock Pixelで、実行中のnative Sky選択仕事を実再起動し、lease回収・再開・結果・履歴を確認する。
2. **flash前の保全**: 実装済みbackup v2を物理Pixelのwipe復元で受け入れ、純正復旧artifact、vendor inventory、production署名入力を完成させる。
3. **緊急保護**: OS外Operator Dockから制限付きAndroid Agentへ至る署名命令、端末側制限、利用者表示、追記監査を実機訓練する。
4. **Android full build**: 全事前gate合格後だけx86_64 Linux環境を契約し、source取得、vendor生成、Soong build、target-files／OTA／factory imageを生成する。
5. **実機受入**: 最後にflash、boot、SELinux enforcing、hardware、CTS/VTS、保存、再起動、OTA、rollback、純正復旧、熱・電池を同一端末で確認する。build環境は初回boot確認まで保持する。
6. **収益と拡張**: 外部Provider sandboxをEarning ReceiptからWalletまで通し、反復実績後にFundを進める。QEMU配布とGameは独立gateとし、Pixel上の中核loopを止めない。
7. **外部接続**: MCP、Wallet、決済、払出し、事業pilotをsandboxから限定LIVEへ段階的に接続する。

Sky、Zema、Wallet、Tool、LLMだけの修正は単体APKで反復し、framework、SELinux、privapp/product設定、boot/vendor/partition/AVBの変更時だけOS imageを再buildします。[full build前の必須gate](docs/phone-preview-20260911.md#有料full-buildへ進む前の必須gate)を全て通すまで、有料サーバー契約とfull buildは開始しません。

本人の判断が必要なのは、製品license、production鍵、対象機種／SKU、課金を伴うbuild環境、実transfer、一般公開です。それ以外の安全な実装・fixture・検査は外部待ちにせず進めます。

## 開発と検証

Node.js 22.13以上とnpmを使用します。

```sh
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npm run dev

# 変更後
npm run database:status
npm run project:update
npm run verify

# OS固有
npm run os:check
npm run os:backend:launch
npm run device-support:check
npm run release:check
```

`npm run verify`は進捗同期、release gate、型、lint、単体試験、MCP package、精算Worker、Fashion Brand Ops、production build、asset closure、API検証を実行します。実機、外部Provider、本番データ、一般公開の受入は別途必要です。

## 正本と主要設計書

| 内容            | 正本                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 確定要望        | [docs/product-baseline.md](docs/product-baseline.md) / [data/product-baseline.json](data/product-baseline.json)                                                   |
| 作業進捗        | [data/project-status.json](data/project-status.json) / [project.md](project.md)                                                                                   |
| 現在状態        | [docs/current-state-20260911.md](docs/current-state-20260911.md)                                                                                                  |
| 作業区分        | [docs/workstreams/README.md](docs/workstreams/README.md)                                                                                                          |
| 責任分界        | [docs/workstreams/00-responsibility-boundaries.md](docs/workstreams/00-responsibility-boundaries.md)                                                              |
| DB状態          | [docs/database-status.md](docs/database-status.md) / [data/database-status.json](data/database-status.json)                                                       |
| OS構成          | [docs/rockstaros-1.0-architecture.md](docs/rockstaros-1.0-architecture.md)                                                                                        |
| Native / QEMU   | [docs/native-os-integration.md](docs/native-os-integration.md) / [docs/qemu-release-completion-audit-20260912.md](docs/qemu-release-completion-audit-20260912.md) |
| Android実機     | [docs/phone-preview-20260911.md](docs/phone-preview-20260911.md) / [data/android-physical-release-audit.json](data/android-physical-release-audit.json)           |
| Local AI        | [docs/local-ai-os-integration-20260915.md](docs/local-ai-os-integration-20260915.md)                                                                              |
| Sky / MCP       | [docs/sky.md](docs/sky.md) / [docs/sky-mcp-connector.md](docs/sky-mcp-connector.md)                                                                               |
| Wallet / 精算   | [docs/sky-billing.md](docs/sky-billing.md) / [docs/rock-wallet-production-rail-20260913.md](docs/rock-wallet-production-rail-20260913.md)                         |
| Security / 公開 | [docs/release-minimum-gates.md](docs/release-minimum-gates.md) / [data/release-readiness.json](data/release-readiness.json)                                       |

正本リポジトリは [k999ln/rock](https://github.com/k999ln/rock) です。GitHub保存、Sites配備、release公開、実機書込み、本番資金操作は別々のイベントとして記録します。

<details>
<summary>背景・過去候補・機能別の詳しい説明</summary>

現在のWeb/Skyローンチ候補、起動・設定・監視・復旧手順は[OSバックエンド・ローンチ手順](docs/backend-launch-20260912.md)を参照してください。

多機種対応は、**共通RockstarOS Core＋機種／SKU別Device Support Package**で進めます。提供区分は完全なOS image、Android GSI実験版、既存OS上のclient、非対応を混同しません。最初の物理対象は所有済みPixel 10／`frankel`に決定し、Pixel 7はその受入後まで保留します。BlackBerryは機種別調査、iPhone／iPadはOS置換ではなくclientです。[多機種対応設計](docs/device-support-architecture.md)／[機械可読の対応台帳](data/device-support-matrix.json)。

スマホ実機版の開発を開始しました。最初の対象はPixel 10／`frankel`ですが、現在はソース統合準備で、書込み可能なOSは未生成です。所有端末のproductとOEM unlocking可否を読取り専用で確認するまでfull OS buildとflashは停止し、build入口は64 GiB RAM／400 GiB空きとlock由来sourceの再検証を要求します。[現在の開発状態](docs/current-state-20260911.md)／[ビルド環境・実装・次の手順](docs/phone-preview-20260911.md)。

公開設定・本人限定サイトの状況は[今回の設定記録](docs/owner-setup-20260911.md)を参照。

tob側の自動化ツールを商品として管理するSkyと、自動化で得たお金を管理するWalletに特化したOSを開発します。Skyは単なるツール一覧ではなく、**探す→権限・料金を確認→端末/PC/Cloudへ実行→停止→結果と記録を受け取る**までを一か所につなぎます。[Skyの図・優位性・現在の収録ツール](docs/sky.md)を参照してください。

**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ43）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定です。Skyの8.88 USDは先払い月額ではなく、検証済み自動化収益からだけ回収する月間上限です。

Home以外の全画面には、現在の操作を迷子にせず直接Homeへ戻れる導線を常設しています。モバイルZemaは共通ヘッダーを省くため、Zema上部に専用のHomeボタンを表示します。

ホームの設定アプリには「システム診断と保全」があります。通信・安全な接続・保存・暗号化・更新・通知・PWA表示・API・PC Connectorをその場で診断し、通知テスト、保存保護、個人情報なしの診断共有、暗号化バックアップ・復元、安全なホーム設定初期化を実行できます。PWAは固定identity/scopeとiPhone/Android向けinstall iconを持ち、新版は自動即時切替せず、「更新を確認」後に本人が「更新を適用」を押した場合だけ切り替えます。公開条件はAndroid互換、GMS、物理端末、署名、OSS、無線規制、マイナンバーを別gateで表示します。これはWeb/PWAの運用機能であり、物理端末のBSP・bootloader・正式署名鍵・外部Provider接続の代わりではありません。

[最低公開条件](docs/release-minimum-gates.md)は、本人限定Web/PWA、一般公開Web/PWA、QEMU配布、Android実機、iPhone/iPad client、マイナンバーを別々に判定します。本人限定Web/PWAは、8 HTTP防御headerとPWA manifest・3 iconをローカルproductionの8経路で実測済みですが、本人限定Sitesの最新版同期と実response再読取り待ちで4/5です。[QEMU rc2の完了監査](docs/qemu-release-completion-audit-20260912.md)は6/10要件合格です。[Android実機・マイナンバー監査](docs/android-and-personal-number-gates-20260913.md)はそれぞれ1/6と1/7で、Android側は機種／SKUのみ合格、SELinux分離とCDD／CTS／CTS Verifier／VTSを未達のまま維持します。`npm run release:check`はこれらの監査を公開台帳へ結合し、旧nativeの転用、証拠なしの端末互換・GMS・販売可能表示、未承認の個人番号取得を拒否します。`npm run release:signing:check`は候補準備・法務承認・保護署名・本人署名の64公開fixture回帰を実行し、全体verifyへ含まれます。`npm run release:sbom`はWeb/npm、現在のrc2 native、旧nativeのCycloneDXをGit対象外の別fileへ生成します。現在はready 0/6です。

SkyのWallet画面には、検証済み自動化収益の精算状況を追加しました。独立WorkerがExecution Receipt、Provider入金参照、証拠hashを持つ署名済みEarning Receiptだけを受け、実費の後から月最大888 USD centsを回収し、残額の払出し指図を作ります。売上0時の請求、未達分の債務化・翌月繰越、カード定期請求はありません。先払いCheckout APIは停止済みです。販売・決済・払出しProviderのsandbox接続と本番条件は未完了です。[実装とProvider接続手順](docs/sky-billing.md)。

[8原則に基づくRockstarOS 1.0設計](docs/rockstaros-1.0-strategy.md)を追加しました。現ベースを維持し、一つの商品で実行・成果・費用・復旧まで確認できる体験を検証します。初期対象の文章系個人事業主と既存引用整理は検証仮説。配布/実用の優先順位、試用指標、CM導線、責任分担を具体化し、未実証の需要や本番利用可能性は主張しません。

**[設計v1.1](docs/os-sky-wallet-game-design.md)の実装は承認済みです。** [承認範囲](docs/execution-approval-20260909.md)に従い、専用branchでnativeと設計を統合しています。公開・実機・MetaMask実資金は条件付き了承を保持し、技術的な準備を検証します。達成演出は見送り、市場案は検討のみです。

**このbranchにはLinux / Buildroot / ARM64 QEMU native OSの試作があります。** main/native/設計の3入力を統合した[PR #2](https://github.com/k999ln/rock/pull/2)を起点に開発しています。旧`b8287bc`の[限定受入D0〜D5](docs/os-acceptance-b8287bc-20260909.md)を保持し、run44は元planの5boot・61jobs・3641.769秒と正常停止を独立照合して回収しました。旧合格とは別に、Game統合9ab候補で[D0〜D6の限定受入](docs/os-acceptance-9abf78a-20260910.md)を完了しました。mainへの統合と実機対応は未実施です。

開発入口: [native統合方針](docs/native-os-integration.md)、[nativeの使い方](systems/rock-star-os/README.md)、[過去のsource検証](docs/native-os-validation.md)、[現在のCHECKPOINT](CHECKPOINT.md)。以前のBlackBerry希望は型番未確認。Pixel 10／`frankel`を最初の実機対象に選択済みで、端末readbackとOEM unlocking確認待ちです。月888 cents固定・同契約の複数端末で1回を維持します。

旧Android/AOSPの入口は [OS開発設計書](docs/os-development-design.md)。現在の製品判断には製品ベースと対象branchの現行方針を使います。

コードの現在地と再開手順: [P1実装・検証手順](docs/os-prototype.md)、[実際のTool契約](contracts/README.md)。AOSPへ組み込む設定は `android/Android.bp` と `os/device/`。これらの存在をOS起動済みの証拠にはしません。

今回の[統合後の試験結果](docs/os-operational-validation-20260909.md)と、GrapheneOSを保持する[Pixel 10向けP1アプリ試験](docs/android-trial.md)を分けて記録します。P1は記事処理の試作で、Sky＋Walletやゲーム交換の実機版ではありません。

Mac向けrc2の入口は[導入ガイド](docs/preview-installation-ja.md)。既存VM向けの[専用launcher](systems/rock-star-os/os/desktop/LAUNCHER-V2.md)も保持しています。起動時に指定した仮想端末と画像を確認し、同じ保存データを再度開きます。ブラウザは実OSの画面を映すために使います。終了はOS内の「端末」→「電源を切る」→「確認して実行」。Wallet/ATMは合成データ専用で、MetaMask送受金には接続していません。

[前日の実装・検証・未達の記録](docs/implementation-checkpoint-20260909.md)を履歴として保持しています。現在のGX00は実TLSで複数owner/game分離の必須受入を通過し、GX01の署名quote・別購入承認・両台帳とnative UIを統合しました。SDK・Game profile・停止/復旧と実OSの限定受入は[最新記録](docs/release-followup-20260910.md)に保存済みで、本番ゲームや実資金には接続していません。

Developer Previewの紹介はローカル`/rockstaros`に集約し、最初の画面を「OSをインストール」導線へ簡素化しました。同じページにSky Tool SDKの最小コード例と本人限定Siteの`/studio`導線を置いています。[導入・初回実行・復旧ガイド](docs/preview-installation-ja.md)と[既知制限](docs/preview-release-notes.md)は`/rockstaros/guide`から確認できます。ダウンロード一般公開は正式署名・許諾・最終配布受入と公開承認待ちです。

正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。旧ローカル作業名は `gg`。現在の実装再開先は `codex/rockstaros-launch-candidate-20260910` で、SSD上の旧checkoutを最新と仮定しません。製品は`RockstarOS`の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。

**CMの現在状態（2026-09-11）:** 最新の回答は制作途中です。完成・選定・内容照合・掲載が残ります。9月10日の完成済みという回答は過去の[履歴](docs/release-followup-20260910.md)として保持します。「追加1〜2日」はLICENSE／Sitesの待ちを除くQEMU版仕上げの条件付き概算で、確定公開日ではありません。[完了範囲・見積もり・残件の詳細](docs/release-followup-20260910.md)。

</details>

## 全taskの作業進捗

以下は `data/project-status.json` から生成します。日常作業では先に [作業ストリーム案内](docs/workstreams/README.md) を使用してください。

<details>
<!-- project-details-summary:start -->
<summary>120 taskと段階gateの詳細を開く</summary>
<!-- project-details-summary:end -->

<!-- project-status:start -->
最終更新: 2026-09-18 / Pixel 10 compile-only Developer Previewの初回full build準備 / 完了 81/120件

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| AI01 | RQ48をAstraで詳細設計しSolの独立監査を反映（設計のみ、runtime完了ではない） | 完了 | [記録](docs/product-baseline.md) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/ai-native-os-design-audit.md) |
| AI02 | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI03 | モデル非依存の限定記憶・project分離・根拠・削除契約を実装し、projection更新を受入 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI04 | 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI05 | Sky app／OSの能力宣言と単一実行端末固定を実装し、多端末移管は独立拡張として受入 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI06 | 非金融Game／IP fixtureを共通仕事・限定記憶・Zema進捗へ接続（Fund完成に非依存） | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| MAT01 | RQ49 Material Invention Coreのentity・発明loop・安全境界を設計へ固定 | 完了 | [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/material-invention-core.md) |
| MAT02 | 二物質・複数比率・工程条件のsandbox候補graphとfail-closed安全検査を実装 | 完了 | [記録](contracts/material-invention.json) · [記録](contracts/material-invention-fixture.json) · [記録](lib/material-invention.ts) · [記録](tests/material-invention.test.mjs) · [記録](docs/material-invention-core.md) · [記録](docs/validation.md) |
| MAT03 | Material Invention CoreをZemaの仕事・限定記憶・simulation／外部ラボProviderへ接続して独立受入 | 未着手 | [記録](docs/material-invention-core.md) |
| MAT04 | Material Invention Coreの標準体験としてavocadoMiniの四方向sensor・hand操作・再計算・Patent AI設計を固定 | 完了 | [記録](docs/material-invention-xr.md) · [記録](docs/avocado-mini-spatial-invention.md) · [記録](data/material-invention-xr-policy.json) · [記録](contracts/material-invention-xr.json) · [記録](contracts/avocado-mini-spatial-interaction.json) |
| MAT05 | Core graphから決定的XR sceneを生成し、四方向pose fixtureのconnect／separate／stale拒否を実装 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| MAT06 | avocadoMini四方向tabletop prototypeとMaterial Core→Patent AI provenance bridgeを独立受入 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| SKY01 | 旧名称をSkyへ全面改称し、選択・許可・実行先・停止・結果を一つにする価値と収録ツールを可視化 | 完了 | [記録](docs/sky.md) · [記録](components/sky-workspace.tsx) · [記録](scripts/check-sky.mjs) |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了 | [記録](app/sky/publish/page.tsx) · [記録](components/sky-publisher-form.tsx) · [記録](app/api/sky/submissions/route.ts) · [記録](tests/sky-submission.test.mjs) |
| SKY03 | MCP接続・周辺先行技術を調査し、特許出願可能性を高める技術設計を保存 | 完了 | [記録](docs/sky-mcp-architecture.md) · [記録](systems/rock-star-os/docs/MCP-HUB-INTEGRATION.md) |
| SKY04 | tob無料のConnection Passport・実行契約・ToB/ToC貢献分配を一画面で説明するSky Networkフロント | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SKY05 | Sky画面のsidebarを廃止し、MCP接続・管理とToB掲載をSky本体の操作面へ統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/sky/network/page.tsx) · [記録](app/sky/publish/page.tsx) |
| SKY06 | Sky内MCPを実在するPC接続・既存4自動化・3ステップ導入画面へ統合 | 完了 | [記録](components/sky-mcp-center.tsx) · [記録](components/device-connection.tsx) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](scripts/verify-mcp-flow.mjs) |
| SKY07 | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) |
| SKY08 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY09 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了 | [記録](components/sky-workspace.tsx) · [記録](app/api/sky/connections/route.ts) · [記録](docs/sky-identity-connection.md) |
| SKY10 | Skyをアプリ選択と接続へ絞り、Chatを依頼・状況・結果の受取画面として分離 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/chat/page.tsx) · [記録](app/polymarket/page.tsx) |
| SKY11 | MCP掲載前診断とPC接続の互換性・初回導線を改善 | 完了 | [記録](lib/mcp-inspection.ts) · [記録](app/api/sky/mcp/inspect/route.ts) · [記録](lib/device.ts) · [記録](components/sky-publisher-form.tsx) · [記録](components/device-connection.tsx) · [記録](tests/mcp-inspection.test.mjs) · [記録](tests/device-lifecycle.test.mjs) |
| SKY12 | ChatをSky Auto既定の一画面へ整理し、事前のアプリ選択を任意化 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](docs/sky-identity-connection.md) |
| SKY13 | GrokをモチーフにChatの表示・入力を改善し、依頼から実行・結果までを会話内へ統合 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](lib/operations.ts) · [記録](tests/operations.test.mjs) · [記録](docs/chat-usability-20260912.md) |
| SKY14 | 接続済みready商品と任意MCPをChatのbotとして表示し、方向修正・承認実行・結果・停止を一元管理 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mcp-bot-runner.tsx) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](docs/chat-mcp-control-room-20260913.md) |
| SKY15 | Sky SDKコードを既存ツールへ追加し、起動時にPackage登録・MCP公開・利用記録まで行うStudioを実装 | 完了 | [記録](components/rock-studio.tsx) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](app/studio/page.tsx) · [記録](app/sky/publish/page.tsx) · [記録](tests/sky-code-intake.test.mjs) · [記録](tests/sky-studio-chat.test.mjs) · [記録](docs/sky-tool-sdk.md) |
| SKY16 | SkyのTool選択と自然文依頼をZemaへ一回引き継ぎ、job状態を即時同期 | 完了 | [記録](lib/sky-zema-handoff.ts) · [記録](lib/operations-client.ts) · [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/chat-live-progress.tsx) · [記録](tests/sky-zema-handoff.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/sky.md) |
| WEB02 | Developer Preview紹介をOSインストールとSky開発者コード中心の一画面へ再設計 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](docs/product-baseline.md) |
| WEB03 | Developer Preview紹介とRock Studioを共通の黒・黄緑visual systemへ統一 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](components/rock-studio.tsx) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) |
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了 | [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](components/workspace-shell.tsx) · [記録](app/workspace.css) · [記録](tsconfig.json) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/frontend-usability-audit-20260915.md) · [記録](docs/product-baseline.md) |
| BRD01 | 正式製品名をRockstarOS、内部識別子をdev.rockで固定 | 完了 | [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](app/layout.tsx) · [記録](app/manifest.ts) · [記録](components/home-screen.tsx) · [記録](android/automation/src/main/java/dev/rock/automation/ApprovalActivity.java) · [記録](tests/product-baseline.test.mjs) |
| VER01 | RockstarOS 1.0と将来の1.5／2.0版更新規則を一元管理 | 完了 | [記録](data/product-identity.json) · [記録](lib/product-identity.ts) · [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](components/workspace-shell.tsx) · [記録](components/system-settings.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/product-baseline.test.mjs) |
| WLT01 | Walletの受取予定・収益内訳・Receipt・精算ルールを一画面で確認できるフロントを実装 | 完了 | [記録](docs/wallet-front-design.md) · [記録](components/sky-billing.tsx) · [記録](components/operations-workspace.tsx) · [記録](app/workspace.css) |
| WLT02 | 本人別の残高・売上・経費・取消履歴をD1へ保存するWallet専用APIと操作画面を実装 | 完了 | [記録](app/api/wallet/route.ts) · [記録](components/wallet-workspace.tsx) · [記録](lib/operations.ts) · [記録](tests/wallet-backend.test.mjs) |
| WLT03 | Wallet／ファンド会社を交換可能な外部Providerとして受ける責任境界とadapter契約を固定 | 完了 | [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](docs/validation.md) |
| WLT04 | Rock Settlement Walletを最初のProviderとして自社利用料のsandbox回収契約を実装 | 完了 | [記録](lib/financial-provider.ts) · [記録](tests/financial-provider.test.mjs) · [記録](docs/rock-first-party-settlement-wallet-20260913.md) · [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/validation.md) |
| WLT05 | Base Mainnet USDCの所有確認付き受取先とfinalized着金照合を本番Wallet・Workerへ接続 | 完了 | [記録](components/rock-settlement-wallet.tsx) · [記録](lib/rock-wallet.ts) · [記録](services/sky-billing/src/worker.ts) · [記録](services/sky-billing/migrations/0004_rock_settlement_wallet.sql) · [記録](tests/rock-wallet.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](docs/rock-wallet-production-rail-20260913.md) |
| WLT06 | owner受取Walletを本人署名で登録し、最初の実USDC回収をEarning Receiptへ照合 | 進行中 | [記録](docs/rock-wallet-production-rail-20260913.md) |
| MKT01 | あらゆる型付き価値を扱うPAPER市場とexact approval・risk・receipt・position台帳を実装 | 完了 | [記録](app/market/page.tsx) · [記録](app/api/market/route.ts) · [記録](components/everything-market.tsx) · [記録](lib/everything-market.ts) · [記録](lib/everything-market-store.ts) · [記録](drizzle/0009_sad_giant_girl.sql) · [記録](tests/everything-market.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| MKT02 | Web PAPER市場のapproval・reservation・receipt・position関係をD1で強制 | 完了 | [記録](drizzle/0012_marketplace_relation_guards.sql) · [記録](tests/everything-market.test.mjs) · [記録](scripts/check-web-schema.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) · [記録](docs/data-storage-boundaries.md) |
| DB01 | 全データ境界・table・migration・本番readback状態を一つの監査レポートへ統合 | 完了 | [記録](scripts/database-status.mjs) · [記録](data/database-deployments.json) · [記録](data/database-status.json) · [記録](docs/database-status.md) · [記録](tests/database-status.test.mjs) |
| SPN01 | native Walletへsimulation/PAPER限定のValue/Spend台帳・exact approval・再照合を統合 | 完了 | [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/src/blackberryrock/wallet.py) · [記録](systems/rock-star-os/src/blackberryrock/hub_server.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) · [記録](docs/value-spend-runtime.md) |
| FND01 | ツールの検証済み純収益・実費・receipt・失敗から構成と観測利回りを30秒ごとに再計算 | 完了 | [記録](lib/automation-fund.ts) · [記録](lib/automation-fund-store.ts) · [記録](app/api/automation-funds/route.ts) · [記録](components/autonomous-fund-market.tsx) · [記録](tests/automation-fund.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| WEB01 | 主要画面のstyle契約と配備asset closureを検査し、GitHubと本人限定Sitesを同一commitへ固定 | 停止中: GitHub mainは全体検証済み。本人限定Sitesは現在の接続アカウントでAccess Denied／project_not_foundとなり、所有workspaceの接続なしでは同一SHA配備とD1本番readbackを実行できない。 | [記録](tests/web-route-style-contract.test.mjs) · [記録](scripts/check-web-asset-closure.mjs) · [記録](tests/web-asset-closure.test.mjs) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) · [記録](docs/evidence/launch/sites-owner-auth-blocker-20260915.json) |
| HOME01 | iPhone着想のホーム、端末内カスタマイズ、OS運用設定アプリを実装 | 完了 | [記録](app/page.tsx) · [記録](app/sky/page.tsx) · [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](app/settings/page.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-settings.module.css) · [記録](docs/product-baseline.md) |
| HOME02 | Home以外の全画面へ直接Homeへ戻る導線を常設し、共通・独自レイアウトの回帰を防止 | 完了 | [記録](components/workspace-shell.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-maintenance.tsx) · [記録](app/fund/page.tsx) · [記録](app/fund/legacy/page.tsx) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/product-baseline.md) |
| SYS01 | 端末診断・暗号化設定バックアップ・復元・Web更新確認を設定へ実装 | 完了 | [記録](app/settings/system/page.tsx) · [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS02 | 通知・保存保護・診断共有・安全な初期化と公開審査gateを設定へ実装 | 完了 | [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS03 | 公開方法別の最低条件を機械判定し、Web/npm SBOMと設定画面へ統合 | 完了 | [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](components/system-maintenance.tsx) |
| SYS04 | QEMU rc2を同一候補10要件へ固定し、rc2固有native SBOMを生成して旧inventoryの誤転用を拒否 | 完了 | [記録](data/qemu-release-audit.json) · [記録](data/qemu-rc2-legal-info/manifest.csv) · [記録](data/qemu-rc2-legal-info/host-manifest.csv) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/qemu-release-completion-audit-20260912.md) · [記録](components/system-maintenance.tsx) |
| SYS05 | 候補準備・法務承認・保護署名・本人署名の64拒否境界試験を全体verifyへ統合 | 完了 | [記録](scripts/check-release-signing.mjs) · [記録](scripts/release_signing.py) · [記録](scripts/release_signing_owner.py) · [記録](scripts/prepare_release_candidate.py) · [記録](scripts/verify_owner_legal_approval.py) · [記録](tests/test_release_signing.py) · [記録](tests/test_release_signing_owner.py) · [記録](tests/test_prepare_release_candidate.py) · [記録](tests/test_owner_legal_approval.py) · [記録](docs/release-signing-operations.md) |
| SYS06 | Android物理端末とマイナンバー連携を独立監査し、証拠なしの互換・GMS・販売・個人番号有効化を拒否 | 完了 | [記録](data/android-physical-release-audit.json) · [記録](data/personal-number-release-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/android-and-personal-number-gates-20260913.md) · [記録](docs/release-minimum-gates.md) |
| SYS07 | Web/PWAのHTTP防御を正本化し、Worker・static asset両経路の実responseを検査 | 完了 | [記録](data/web-security-policy.json) · [記録](next.config.ts) · [記録](public/_headers) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/web-security-policy.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS08 | PWA新版の自動即時切替を廃止し、本人確認後の適用・旧cache整理・再読込へ変更 | 完了 | [記録](public/sw.js) · [記録](components/system-maintenance.tsx) · [記録](tests/service-worker-update.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS09 | PWAの同一性・scope・iPhone/Android向けinstall iconを固定し、実HTTP manifestを検査 | 完了 | [記録](app/manifest.ts) · [記録](public/rock-icon-192.png) · [記録](public/rock-icon-512.png) · [記録](public/rock-icon-maskable.svg) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/pwa-installability.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS10 | Web第三者依存のlock hash・47要review componentのPURL一覧を公開gateへ固定 | 完了 | [記録](package-lock.json) · [記録](data/web-third-party-license-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS11 | Vite生成chunkのnpm componentをbuild時に記録しlicense監査へ照合 | 完了 | [記録](vite.config.ts) · [記録](scripts/web-bundle-inventory.mjs) · [記録](scripts/check-web-bundle-inventory.mjs) · [記録](tests/web-bundle-inventory.test.mjs) · [記録](package.json) · [記録](data/release-readiness.json) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS12 | 運営1名で開始できる緊急保護・限定保守accessの脅威モデルと端末側制御契約を固定 | 完了 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](docs/product-baseline.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SYS13 | 緊急accessのAndroid service・hardware credential・端末側制限・監査を実装しPixel 10で侵入／復旧試験 | 進行中 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](services/operator-dock/public/index.html) · [記録](services/operator-dock/src/worker.ts) · [記録](services/operator-dock/src/access-auth.ts) · [記録](services/operator-dock/src/operator-control.ts) · [記録](services/operator-dock/src/device-channel.ts) · [記録](services/operator-dock/migrations/0001_operator_device_control.sql) · [記録](services/operator-dock/migrations/0002_signed_device_channel.sql) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandVerifier.java) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorAgentJobService.java) · [記録](tests/operator-control.test.mjs) · [記録](tests/operator-device-channel.test.mjs) · [記録](tests/operator-access-auth.test.mjs) · [記録](tests/operator-dock-isolation.test.mjs) · [記録](android/operator-agent/src/androidTest/java/dev/rock/operator/agent/OperatorAgentIntegrationTest.java) · [記録](android/operator-agent/src/main/res/values/overlayable.xml) · [記録](scripts/stage-operator-agent-overlay.py) · [記録](tests/test_stage_operator_agent_overlay.py) · [記録](os/physical/operator-agent-overlay/README.md) · [記録](docs/evidence/android-operator-agent-emulator-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](docs/evidence/android-operator-overlay-stager-20260916.json) |
| SYS14 | 製品目的から全層の選択・接続・実証状態を一つの構成監査へ固定 | 完了 | [記録](docs/system-composition.md) · [記録](data/system-composition-audit.json) · [記録](scripts/check-system-composition.mjs) · [記録](tests/system-composition.test.mjs) |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了 | [記録](docs/reference-repositories.md) |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了 | [記録](project.md) |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了 | [記録](tests/workflow.test.mjs) · [記録](scripts/check-work-api.mjs) |
| R04 | README・設計進捗の同期とCI検証 | 完了 | [記録](scripts/project-status.mjs) · [記録](.github/workflows/ci.yml) · [記録](docs/native-ci-partition-fix-20260910.md) |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了 | [記録](docs/validation.md) |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了 | [記録](docs/validation.md) |
| R07 | 本人限定のSitesへ公開・本番確認 | 完了 | [記録](docs/deployment-integration.md) · [記録](docs/release-followup-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了 | [記録](project.md) · [記録](docs/validation.md) · [記録](docs/deployment-integration.md) |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了 | [記録](docs/os-development-design.md) |
| DSP01 | 共通Core・機種別Device Support Package・4提供区分の設計と検査 | 完了 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) · [記録](scripts/check-device-support.mjs) |
| OS02 | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 進行中 | [記録](docs/os-development-design.md) · [記録](docs/phone-preview-20260911.md) · [記録](os/physical/frankel-source-lock.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| OS07 | Local Action Assistantの固定source・オフラインLLM契約・署名限定Binder client/server・APK staging gateを実装 | 完了 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-action-assistant-source-lock.json) · [記録](docs/evidence/local-ai-overlay-validation-20260915.json) |
| OS08 | Local Action AssistantのKotlin・arm64 APKをnative buildし、artifact lockとSoong OS imageへ接続 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](.github/workflows/local-ai-apk.yml) · [記録](scripts/build-local-ai-apk.sh) · [記録](scripts/stage-local-ai-apk.py) · [記録](os/physical/local-action-assistant-artifact-lock.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) |
| OS09 | 確定した対象端末でGGUF import・機内モード推論・変更確認・30分連続温度試験を完走 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](docs/evidence/android-pixel-10-gl066-local-ai-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) |
| OS10 | Tool／MCP／Provider共通APIとnative Zema選択Tool経路、本人承認、Wallet台帳、暗号化backup、署名更新gateを実装 | 進行中 | [記録](docs/platform-core.md) · [記録](docs/os-prototype.md) · [記録](contracts/platform-api.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](scripts/check-android-release-architecture.mjs) · [記録](tests/android-release-architecture.test.mjs) · [記録](android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl) · [記録](android/automation/src/main/java/dev/rock/automation/RockPlatformService.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](android/tool-sdk/src/main/java/dev/rock/sdk/ZemaToolPlan.java) · [記録](docs/evidence/android-zema-selected-tool-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](android/sepolicy/private/rockstar_platform.te) |
| OS11 | Platform CoreをAOSPでbuildしSELinux enforcing boot、production署名更新、OTA rollbackを実機検証 | 未着手 | [記録](docs/platform-core.md) · [記録](docs/phone-preview-20260911.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| G03 | Web DBの保存境界・互換migration・重複防止checkを整理 | 完了 | [記録](docs/data-storage-boundaries.md) · [記録](scripts/check-web-schema.mjs) · [記録](tests/migration-union.test.mjs) |
| B01 | Sky＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/product-north-star-20260915.md) · [記録](docs/progress-audit-20260909.md) · [記録](docs/prompt-playbook.md) · [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/validation.md) |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) · [記録](docs/sky-patent-assistant-20260912.md) · [記録](tests/patent-assistant.test.mjs) |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](app/api/earnings/receipts/route.ts) · [記録](lib/earning-bridge.ts) · [記録](tests/earning-bridge.test.mjs) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) · [記録](docs/evidence/pixel-tool-wallet-correlation-20260916.json) |
| B05 | Wallet連携基礎を使ったSky縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/hub-wallet-pc-comparison-20260909.md) · [記録](docs/evidence/hub-wallet/b05-pc-machine-20260909/report.json) |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/os-readiness-audit-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/validation.md) |
| V01 | 旧9abf78a候補のQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す（現rc2へ転用しない） | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/os-operational-validation-20260909.md) · [記録](docs/evidence/os-base/startup-update-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/registry-negative-b8287bc.json) · [記録](docs/os-acceptance-b8287bc-20260909.md) · [記録](systems/rock-star-os/os/desktop/LAUNCHER-V2.md) · [記録](docs/evidence/rls01/final-d6-ci-20260910.json) · [記録](docs/evidence/rls01/final-d6-root-audit-20260910.json) · [記録](docs/os-local-final-20260910.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx00-owner-isolation-adr.md) · [記録](docs/evidence/gx00/integration.json) · [記録](systems/rock-star-os/os/wallet_backend/FENCE.md) · [記録](docs/gx00-connection-wire-v1.md) · [記録](docs/evidence/gx00/game-protocol-review.json) · [記録](docs/game-connection-node-wire-20260909.md) · [記録](docs/gx00-connections-runtime.md) · [記録](docs/evidence/gx00/game-connections-root.json) · [記録](docs/gx00-legacy-game-basis.md) · [記録](systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md) · [記録](docs/evidence/gx00/current-copy-foundations-root.json) · [記録](docs/gx00-current-game-restore.md) · [記録](docs/gx00-owner-connection-client.md) · [記録](docs/evidence/gx00/current-game-integration-root.json) · [記録](docs/implementation-checkpoint-20260909.md) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-contract-implementation-plan.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | 実機候補1機種の型番/SKU・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| N04 | Pixel 10受入後だけ二機種目のDevice Support Package候補を再評価 | 未着手 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 完了 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) · [記録](docs/release-followup-20260910.md) |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 進行中 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| LCH01 | TLS／累積timeoutの原因と最終CIの照合 | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH02 | 全同梱物inventory・対応source・製品LICENSEの明示決定 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH03 | production署名・保護環境・失効運用 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) |
| LCH04 | Sites履歴のコード統合・新規本人限定サイト・Sky改善 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/sites-owner-private-20260913.json) |
| LCH05 | 制作中CMの完成待ち・内容照合・導入案内への接続 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH07 | 同一最終候補の再現配布・導入・復旧リハーサル | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH08 | ローカルOSバックエンドの安全終了・ヘルスチェック・再起動時のreceipt復元を検証 | 完了 | [記録](docs/backend-launch-20260912.md) · [記録](docs/evidence/launch/backend-rc3-local-20260912.json) · [記録](systems/rock-star-os/scripts/verify-backend-launch.py) · [記録](systems/rock-star-os/tests/test_hub.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) |
| FB01 | Instagram運用・受注型ブランド管理をRockstarOS Hub商品とMCPへ統合 | 完了 | [記録](docs/fashion-brand-ops-integration.md) |
| FB02 | 売上・数量・粗利・期限からCampaign Autopilotの計画と次アクションを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB03 | DM履歴・購買意向・顧客情報からAI Sales Conciergeと営業パイプラインを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB04 | 入金確認後の制作計画・原価・納期・工程をProduction Cockpitで管理 | 完了 | [記録](toolkits/fashion-brand-ops/db/migrations/003_autonomous_operations.sql) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB05 | 改善版Skyの役割フィードへブランド運営役と40 MCP操作を統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| FB06 | Instagram画面の写真から未確認候補を作り、Meta確認後だけ運用対象へ進める | 完了 | [記録](docs/instagram-photo-onboarding-20260912.md) · [記録](toolkits/fashion-brand-ops/db/migrations/004_screenshot_account_intake.sql) · [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) · [記録](components/fashion-brand-ops-runner.tsx) |
| BIL01 | 先払い月額を停止し、検証済み自動化収益からだけ実費後に月最大888 centsを精算 | 完了 | [記録](docs/sky-billing.md) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](services/sky-billing/migrations/0002_earnings_settlement.sql) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| BIL02 | 有償自動化商品と販売・決済・払出しProvider sandboxを接続し、Earning Receiptから実送金まで受入 | 進行中 | [記録](docs/sky-billing.md) |
| BIL03 | メルカリを最初の収益経路として出品準備・費用計算・承認・未照合売上の安全な状態管理をSkyへ追加 | 完了 | [記録](docs/mercari-revenue-loop.md) · [記録](lib/mercari-revenue.ts) · [記録](app/api/revenue/mercari/route.ts) · [記録](components/mercari-revenue-starter.tsx) · [記録](tests/mercari-revenue.test.mjs) |
| CSV00 | CSV仕事の35作業を名前空間付きで管理し、コード完成と外部実績gateを分離 | 進行中 | [記録](data/csv-business-tasks.json) · [記録](docs/csv-business-v1.ja.md) · [記録](lib/csv-transform.ts) · [記録](lib/csv-job-store.ts) · [記録](components/csv-business-workspace.tsx) |

段階ゲート（作業全体の完了とは別判定）

| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| B04-INTEGRATED | B04 | 承認後、main/native/設計reviewの3入力と入口を統合 | 合格 | — | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| V01-BOOT | V01 | 旧b8287bc候補のOS起動・安全基礎（現rc2の全体合格ではない） | 合格 | B04-INTEGRATED | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/freeze-b8287bc.json) · [記録](docs/evidence/os-base/boot-b8287bc.json) · [記録](docs/evidence/os-base/platform-b8287bc.json) · [記録](docs/evidence/os-base/native-ui-b8287bc.json) |
| B02-NATIVE | B02 | 既存native商品1件をSkyで実処理・保存 | 合格 | V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03-FIXTURE | B03 | 単一ownerの合成Wallet・商品/費用/売上状態の基礎 | 合格 | B02-NATIVE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) |
| V01-ACCEPT | V01 | 旧9abf78a候補でD0〜D6縦断合格（現rc2へ転用しない） | 合格 | V01-BOOT · B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| B03-PROVIDER | B03 | 実provider/認証済み収益（別の権限・条件が必要） | 未合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| B05-COMPARE | B05 | Wallet基礎後のPC比較/再試験。実機価値は別判定 | 未合格 | B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| GX00-ISOLATION | GX00 | ADR・複数owner分離/本人接続・互換/復旧の合成検証 | 合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/gx00/integration.json) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01-CONTRACT | GX01 | 複数owner/gameの交換契約と両台帳fixture | 合格 | GX00-ISOLATION | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) · [記録](docs/evidence/release-candidate-9abf78a/native-ci.json) · [記録](docs/gx01-dx01-acceptance-20260910.md) |
| GX01-UI | GX01 | OS上の交換操作と台帳変更後D4/D5再検証 | 合格 | GX01-CONTRACT · V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| DX01-SDK | DX01 | 共通SDK・2作者/2game/2owner・fresh導入測定 | 合格 | GX01-CONTRACT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| PREVIEW-INSTALL | RLS01 | 旧9abf78aのfresh導入・起動・保存・復旧・削除を完走（現rc2へ転用しない） | 合格 | V01-ACCEPT | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) |
| ANDROID-PREFULL | OS11 | 有料full build前に単体APK・emulator・純正Pixel offline AI・Sky→Zema→Tool→Walletを完走してfreeze | 未合格 | PREVIEW-INSTALL | [記録](docs/phone-preview-20260911.md) · [記録](docs/product-baseline.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](tests/product-baseline.test.mjs) · [記録](tests/test_prepare_phone_build.py) · [記録](tests/test_stage_local_ai_apk.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| DEVICE-INSTALL | RLS02 | 初回flash gate 4/4後、対象1機種でflash・初回起動・OTA rollback・純正復旧を完走 | 未合格 | PREVIEW-INSTALL · ANDROID-PREFULL | [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |

次の作業: Scalewayの課金確認後、Ubuntu 24.04 / 32 dedicated vCPU / 64 GB RAM / 600 GBで固定sourceをsyncし、Operator Agentを明示除外したbringup modeでtarget-files-packageとotatools-packageをbuildする。RELEASE_FLASH gate、production signing、実機flashは未合格のまま維持する。
<!-- project-status:end -->

</details>

<details>
<summary>Web／PC・商品別の詳細と過去の開発手順</summary>

進捗の正本は `data/project-status.json`。作業ごとに更新し、`npm run project:update` でREADMEとproject.mdを同期します。`npm run project:check` は更新漏れを検出します。

R2の画面確認と修正はGitHubへ保存済みですが、**本番サイトへの反映は未実施**です。配信先だけにあるアプリUI・実行管理・手入力台帳と仕事API/DB移行が重なるため、上書きせず停止しました。保持する機能と再開手順は [統合設計](docs/deployment-integration.md) を参照。

## Web/PC版のSkyと既存Sites機能

保存済みSites source `c6942d5ef72e9dd16345b9363e68e0e18ca25079` の実行管理、利用停止/再開、PC接続管理、手入力収支、PWAを統合中。`/api/jobs` はSitesの実行受付を保持し、仕事の手順管理は `/api/work-jobs` へ分離。手入力金額は実残高・払出可能額ではありません。既存Sitesの実DB適用履歴はアクセス復旧後に照合します。

## 既存Web/PC版で現在できること

- PCの`/studio`またはSkyの掲載入口へコードを貼るかファイルを添付するだけで、Sky組込みコード、LLM向け用途、Schema、権限、安全契約、Fund分類を生成し、コード本文を送らずにTool Packageを登録。
- ジャンル・キーワードからファンドと自動化ツールを検索。
- Mr.由来のココナラ案件チェック、記事の無料版作成、出典整理をブラウザ内で実行。
- Mr.由来の納品記録照合を含むPC用無料パックを配布。元コード4件をMIT・取得commit・ハッシュ付きで同梱。
- 3件の外部OSS候補も引き続き掲載。
- マイファンドの選択と配分計画。旧マイツール用の保存・導入プラン関数も保持。
- Ethereum互換の注入型ウォレットでアドレス接続。キャンセル、アカウント変更、切断を処理。
- 月$8.88相当の利用料と、電力・通信・API費用の試算。
- ホームはSky。旧ファンドは `/fund` に保持し、参加・配分計画・試算条件をアカウントごとに保存。
- 「仕事を進める」から記事販売準備・ココナラ納品準備を作成し、手順・試行履歴・最終確認をアカウント別に保存して再開。
- 基本分配・ブースト・共同留保を、共通収益の範囲内で試算。入金・送金は未接続。
- Sky MCP Connectorを一度起動すると、SkyのMCP画面から登録済みの自動化へワンタップ接続。現在の配布パックは基本4機能と受注型ブランド運営38機能を同じConnectorで検出します。
- 自動化の追加は[`registry.json`](toolkits/sky-mcp-connector/registry.json)へstdioまたはStreamable HTTP定義を加えます。接続時にprotocol・capability・tool schemaをConnection Passport化し、実行は引数に結び付いた一回承認を必須にします。[導入・安全境界](docs/sky-mcp-connector.md)
- Skyの「サブスク顧問」から、PC内のRockstar Ledgerへ読み取り専用で接続。通貨別の月額、更新日、支払い失敗、定期課金候補を確認し、同梱のstdio MCPでも照会できます。契約データはGitやサイトへ送らず、解約・支払い・税務申告は自動実行しません。[導入と境界](toolkits/rockstar-ledger/README.md)
- GitHubとHugging Faceの公開メタデータを収集する管理用コマンド。

ファンドの参加・配分・試算条件、単独ツールの実行メタデータ、仕事の進捗はSitesのD1に保存します。旧マイツール用のローカル保存関数も互換用に保持しています。接続アドレスは保存せず、サーバーへ送信しません。ウォレット接続はログイン認証・実名本人確認・送金認可ではありません。

## 仕事の進め方（現行Web版）

1. ホームの「仕事を進める」から `/work` を開き、サインインします。PC・スマートフォンともページ冒頭とメニューに入口を表示します。
2. 仕事名と「記事の販売準備」または「ココナラ納品準備」を選んで作成します。
3. 表示された手順を実行します。サンプル・失敗・条件不一致は記録されますが、手順は進みません。納品記録照合には最新版のPC接続パックが必要です。
4. 結果を確認してコピーまたはダウンロードし、次の手順へ進みます。原稿は自動で次へ渡されず、タブを閉じると未保存本文は失われます。
5. 全手順の通過後に確認メモを入力して完了します。応募・外部納品・売上発生を意味する完了ではありません。

保存するのは仕事名・確認メモ・実行メタデータで、原稿や成果物は保存しません。名前やメモに秘密情報を入れないでください。仕事は最新100件、試行は1仕事につき最大200件です。本文保存・古い仕事のページ送り・削除は今後の拡張です。全実行は既存Sitesの受付APIを通り、1実行につきtool_runsに1件だけ記録します。仕事内の進捗は別のwork_jobsへ保存し、ツール実行の集計へ二重計上しません。

通信失敗時は「記録の保存を再試行」で処理を再実行せず保存だけを再送できます。別タブとの競合時は「最新状態を読み直す」で確認します。

## 既存Web/Androidで未実装・未検証のこと

以下はAndroid/AOSPトラックの未検証範囲です: 自前OS起動、画面OFF時の実動作、専用隔離、第三者SDK/配布、Pixel書込/復旧、署名OTA。Linux nativeの試作・source試験と区別します。以下も現時点では未接続です。

ココナラでの自動応募・送信・売上取得、外部サービスの自動登録、売上の取得・自動控除、定期決済、資金の受託、収益分配、投資ブースト、端末の電力・通信量の実測、公開サイトへの候補の自動反映。Mr.のココナラ機能のうち、案件条件チェックと納品記録照合を独立して取り込みました。Mr.全体の自律運転は移植していません。

「月13万円」「作成者が6万円を稼いだ」はユーザーから共有された構想・伝聞であり、根拠未確認。実績や利益予測として掲載しません。

## 既存Web/PC版の開発

Node.js 22.13以上（作成時の検証はNode.js 26）、npmを使用。

```sh
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npm run dev
# 作業を終えたら進捗と品質を確認
npm run project:update
npm run verify
# OSバックエンドの実process起動・安全終了・再起動・SQLite整合
npm run os:backend:launch
```

Vinext / React / Cloudflare Workers / Sites。Sitesのサイト設定は `.openai/hosting.json`。開発サーバーの表示したURLを開く。秘密鍵やサービス認証情報は追加しない。

`verify` は進捗の同期・型・プロダクトコードのlint・自動テスト・本番ビルド・ローカルWorker/D1のAPI検証を実行します。API検証はMiniflareで本番APIバンドルを直接起動し、一時DBと合成ユーザーだけを使います。本番データには接続せず、資産ルーティング・開発プロキシ・画面操作は対象外です。GitHub Actionsも同じコマンドで検証します。`npm run lint` は未変更の生成済みUI部品も含む全体検査で、既存の指摘が残っています。

`os:backend:launch` は公開開発fixtureと一時SQLiteだけで、ローカルHubの起動、認証境界、署名ツール実行、SIGTERM、安全な再起動、receipt復元を確認します。実OS boot、実機、外部provider、実資金の検証ではありません。現在のP0/P1/P2と復旧手順は[OSバックエンド最小ローンチ監査](docs/backend-launch-20260912.md)を参照してください。

DB変更時は `npm run db:generate -- --name=変更名` で移行を生成し、SQLを確認します。外付けSSDのmacOSメタデータを除外して生成するラッパーです。既存の移行SQLを書き換えず、追加入力として管理します。`npm run schema:check` はtable名・migration番号・journal・最終schemaの不一致を軽量に検出します。保存先ごとの責任と、削除してはいけない互換migrationは[データ保存境界](docs/data-storage-boundaries.md)に整理しています。

`origin` はGitHubの `k999ln/rock`、`sites` は既存サイトの配信用です。GitHubへのpushだけではサイトは更新されません。本番へ適用するDB移行もSites公開時に別途確認します。

```sh
npm run discover -- transcription
```

GitHubのリポジトリ検索とHugging Faceのモデル検索を並行実行し、`data/discovered.json` に保存。認証なしの公開APIなのでレート制限あり。失敗は記録し非ゼロ終了、成功した情報も保持。取得結果は未審査データであり、コードを実行せず、公開カタログへ自動追加しない。カタログは `lib/catalog.ts` で明示的に管理。

Product Hunt APIは商用利用条件の確認前のため未接続。サービスの公開ページへのリンクのみ。

## 次に進める作業

現行の順序は[全体構成監査](docs/system-composition.md)に従います。最初の機種はPixel 10／GL066／`frankel`へ確定済みで、stock Pixel上のnative AI team loopとflash前gateを先に進めます。QEMU配布は独立した候補として残し、スマホOSの合格へ流用しません。

### 以前の実装順（2026-09-09の履歴）

以下のB04/V01/GX00等には、その後完了した限定受入があります。現在の未着手一覧として使わないでください。

1. main・native開発PRと同一SHAの証拠を確認し、B04で分離作業branchへベースとnativeを統合して全入口・優先順位を同期する。
2. V01で最新sourceから新しいOSをbuildし、QEMUの起動/安全基礎を検証。既存商品・Wallet基礎を接続してD0〜D6の操作/保存/通常終了/再起動/復旧を完了させる。
3. B02/B03/B05で商品条件・資格・実行先と、費用/収益照合・既存Walletを接続し、実利用の改善前後/PC比較を測る。fixture成功と実収益/実機価値は別判定。
4. GX00で複数owner分離・本人接続・台帳互換を通し、GX01でATMから独立したゲーム交換を合成serverで試験し、DX01で作者向けAPI/SDK・サンプル・導入体験を検証。ゲーム料金/方向は未確定、ATM自社手数料0を保持。
5. GX02実ゲームsandbox、BlackBerry適合、実PC/cloud/provider、実資金・本番は個別ゲート。旧Android/AOSPは別トラックとして保持する。

初期APKでの試験は補助であり、それだけをOS完成とは扱いません。当時のSites公開停止は独立したOS開発を妨げる条件ではありませんでした。現在は新しい本人限定Siteを公開済みです。端末購入・初期化・書込・サービス契約は、この設計書作成では実施していません。

詳細は `docs/product.md`、`docs/architecture.md`、`docs/research.md`、`docs/validation.md` を参照。

## 配布条件

GitHubの `rock` は公開リポジトリです。RockstarOS独自コードの再利用ライセンスは未選定であり、ソースを閲覧できることとOSSとしての再利用許諾は別です。カタログで紹介するOSSは各公式ライセンスに従い、モデルの重みは個別に確認します。Mr.から取り込んだ4ファイルは `vendor/mr/LICENSE` のMIT条件で同梱しています。PCパックのRockstarOSアダプターとサンプルも同じMIT条件で配布します。認証情報や過去の案件データは含めていません。

## Sky商品: Instagram運用・受注型ブランド管理

RockstarOS SkyのTimelineと検索欄から「Instagram運用」で見つけられる商品を追加しました。実装は[`toolkits/fashion-brand-ops`](toolkits/fashion-brand-ops)、統合境界と検証範囲は[`docs/fashion-brand-ops-integration.md`](docs/fashion-brand-ops-integration.md)です。

改善版Skyでは、上部の「ブランド運営役」または「Instagramの広告からDM受注まで進めて」のような依頼からこの商品を開けます。ダークな役割フィードで実行場所を確認し、商品画面から38 MCP操作、Campaign Autopilot、Sales Concierge、Production Cockpit、approval gateの状態へ進めます。Sky受付の範囲と未実装のMemoryは[`docs/sky-assistant-and-memory.md`](docs/sky-assistant-and-memory.md)に記録しています。

ブランド方針・商品design、市場判定、Instagram運用、DM、注文、決済、制作・発送、分析に加え、Campaign Autopilot、AI Sales Concierge、Production Cockpit、経営ダッシュボード、本番接続診断を38個のMCP toolとして公開します。目標を入れると投稿計画・下書き・承認要求までの内部作業を自動で進めます。既定は全Providerがmockです。価格変更、外部生成、投稿、広告、DM送信、請求、返金、通知は署名付き個別approvalがない限り実行されません。`paid`と`refunded`は検証済み決済event以外から変更できません。

```sh
npm run test:fashion-brand-ops
npm --prefix toolkits/fashion-brand-ops run db:migrate
npm --prefix toolkits/fashion-brand-ops start
```

実Higgsfield/Meta/Stripe/通知先、QEMU/Android/実機OSへの組込み、本番投稿・実請求は未接続です。

## Mr.から取り込んだツール

ブラウザで3ツール、PCで4ツールを使えます。`docs/mr-integration.md` に取得元と移植差分、`toolkits/mr/README.md` に実行方法があります。

```sh
python3 scripts/package-mr.py
python3 toolkits/mr/rock_star_tools.py coconala-check --input toolkits/mr/examples/coconala.json
```

PCパックは `public/toolkits/mr-toolkit.zip`。元コードのハッシュが変わると実行・再梱包は失敗します。MCPの出典整理は固定CLIの別プロセスで処理し、入力・出力各65,536 UTF-8バイト、処理3秒、同時1件に制限します。macOSはPython 3.13以上、Linuxは3.10以上の通常利用者が対象です。Windowsの新しい出典整理接続は未対応です。native Sky接続と再起動をまたぐ重複実行防止は残件です。PCだけの再現手順と受入範囲は [PC実処理接続](docs/pc-citations-adapter.md) を参照してください。

詳しい今回の動作と会計モデルは `docs/fund-and-mcp.md` を参照。

ローカル保存領域の初期化: `npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc`。プレビューの保存には `/signin-with-chatgpt?return_to=/` から標準のローカルサインインを使います。

</details>
