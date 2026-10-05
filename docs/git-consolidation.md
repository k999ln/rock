# Gitプロジェクト統合方針

整理日: 2026-09-07。native OS追加: 2026-09-09。機械可読の正本は [`data/repository-map.json`](../data/repository-map.json) です。

## 結論

製品は **RockstarOS** の1つです。利用者向けブランド、OS、公開開発の名称を`RockstarOS`へ統一し、内部runtime名`Rockstar_ibot`は互換識別子として維持します。`avocadomini`、`avocadoOS`、`Doraemon`、`Mr. Commerce`、`Private Pixel`、`ワンクリック特許`は独立した新規プロジェクト名として増やさず、履歴上の旧名称または配下機能として扱います。

Gitは公開範囲が異なるため、物理的な1 repositoryにはしません。公開コードと秘密を伴う運用コードを2つの責務へ分け、製品全体の正本を `rock` に固定します。

| repository | 位置付け | 新規開発 | 内容 |
| --- | --- | --- | --- |
| `k999ln/rock` | 製品正本・公開 | 可 | 製品方針、Linux native OS、OS/AOSP、Android SDK、公開Web、Work/Fund、公開契約とfixture |
| `k999ln/Mr.` | 非公開の運用component | 可 | Telegram、クラウド、provider接続、運用receipt、private deployment |
| `k999ln/vvvv` | 旧履歴 | 不可 | 新しい修正先・CI・deploy先にしない。稼働参照の監査後にarchive候補 |
| `k999ln/mr-bot-workrooms` | 非公開の作業成果物 | 不可 | 製品sourceや仕様の正本にしない |

`Mr.`内のTelegramやprovider接続を`rock`へコピーしないのは未統合だからではなく、顧客・運用・credential境界を公開Gitから分離するためです。逆に、OS契約や製品方針を`Mr.`で別仕様として増やしません。

## Linux開発成果の追加

`systems/rock-star-os/` に独立開発の封印済みソースから公開可能な実装を取り込む。以後この領域の変更先もrockとする。取得前の開発履歴・個別環境は移管しない。既存 `os/` はAOSP設定のまま保持する。出所と変更理由はIMPORT-MANIFESTと[統合記録](native-os-integration.md)で追跡する。Mr.の非公開全tree・調査台帳・運用データを公開Gitへ入れない。既存の4件の固定vendorは変更しない。

## 重複監査

`rock`のcommit `9e4dc89d995ccbf11f9e3a15efa0e65868874d48`と`Mr.`のcommit `a82a728`をGit blobで比較し、完全一致するpath組を78件確認しました。

- 4件は、`Mr.`のMITツール原本を`rock/vendor/mr`へ固定した意図的なsnapshotです。原本とhashは変更せず、Rock star固有の修正はadapterに置きます。
- 多くはshadcn由来のUI部品や設定boilerplateです。private packageをpublic buildへ依存させる利点より公開境界を壊す危険が大きいため、cross-repository package化の対象にはしません。
- 実質的な重複は、製品名、ツールHub、8.88 USD案、仕事workflow、OSという説明です。これらの製品定義と公開契約は`rock`を正本とし、`Mr.`は非公開運用として参照します。
- `Mr.`のDocker applianceは既存Linux上のworkerであり、AOSP OSではありません。自前OSのbuild/boot完了として扱いません。

## コードの所有ルール

| 領域 | owner | 共有方法 |
| --- | --- | --- |
| Product/料金/名称/進捗 | `rock` | README、project.md、repository map |
| Work/Tool/Recipeの公開契約 | `rock` | schema、fixture、互換テスト |
| AOSP、Android、端末権限 | `rock` | `android/`、`os/`、`contracts/` |
| Telegram、顧客Bot、owner Bot | `Mr.` | private serviceとして実装。公開側へ秘密や運用台帳を移さない |
| Railway/Supabase/provider | `Mr.` | credential参照を含まないinterfaceとreceiptだけを必要に応じて公開契約へ反映 |
| 既存4ツール原本 | `Mr.` | 固定commitの`vendor/mr` snapshot。adapter/parityは`rock` |
| UI boilerplate | 各repository | 同一内容でもdeploy境界ごとに保持。製品機能の重複には数えない |

新しい機能はowner側だけに実装します。もう一方で必要になった場合は、コードのコピーではなく、入力・出力・権限・失敗条件を公開契約へ追加し、fixtureで同じ振る舞いを検証します。

## 実施済みと残作業

実施済み:

- repositoryの役割、名称、公開範囲を一つのmapへ固定。
- `vvvv`を新規開発・runtime・CI・deploy先として禁止。
- `Mr.`の4ツールは既存の固定commit/hash方式を維持。
- `npm run repository:check`を追加し、正本が一つであること、legacy参照がactive sourceへ戻らないこと、vendor snapshotが改変されていないことを検査。

残作業:

1. `vvvv`を参照するGitHub Actions、Railway、launchd、ローカルserviceがないことを外部環境ごとに確認する。
2. 確認できた場合だけ`vvvv`のREADME/descriptionへ後継を表示し、GitHub archiveを行う。履歴削除やforce pushはしない。
3. `Mr.`内でOS・製品定義を独立に増やしている文書には、`rock`の対応仕様への参照と「private operations」の表示を段階的に追加する。
4. 共有したい新しい処理は、秘密を除いたcontract/fixtureとして`rock`へ提案し、移植前にライセンスと公開可否を確認する。

## 禁止事項

- `Mr.`の`.env`、account registry、顧客データ、receipt、deployment設定を`rock`へコピーしない。
- `vendor/mr`の固定原本やhashを書き換えて最新版扱いしない。
- repository名が似ていることを理由に、稼働先、token、database、公開siteを切り替えない。
- archive前の稼働参照監査を省略しない。


## 2026-10-02 共通実装の統合（G04）

主担当はGit / CI / Operations（ROCK）。利用者の統合指示に基づく実装範囲は次のとおり。名称が似ていても、実行権限や成果物の意味が違う処理まで一つの状態機械へ置き換えない。

| 対象 | 共通の修正先 | 各adapterに残す責務 |
| --- | --- | --- |
| 法務・特許AI | `lib/research-ai.ts` | 認証、送信同意、入力上限、公式domain一覧、固有prompt・緊急停止 |
| Jev評価・意思決定 | `lib/jev-transport.ts` | 評価rubric、決定境界、費用見積り、remote opt-in |
| PC・Fashion MCP | `lib/mcp-client.ts` | origin、token長、protocol範囲、接続世代、変更系承認 |
| Toolの一覧 | `lib/catalog.ts`、Connectorの既存registry | Job/connectionの型・一覧をcatalogから導出。IP Studio重複とFashion件数差を除去 |
| Work・ココナラJSON保存 | `lib/owner-revision-json-store.ts` | 入力schema、認証owner、個別状態、競合時のHTTP応答。Mercariの件数制限・再送衝突規則は独立 |
| Sky・Mini・Fashion決済 | `shared/stripe.mjs` | Connect配分、注文/在庫/規約、請求書、個別のidempotency key、各環境設定 |
| Web・公開PreviewのSky→Zema | `public-release/rockstaros/packages/sky-zema-core/src/handoff.js` | WebのUUID・10分TTL・Tool一致・一回消費、公開v1の`local`表記と必須入力 |
| 検証入口 | root `npm run verify` | PR #39 のSite試験と公開Preview全5 suiteを追加。#51のCSV安全修正と既存README/baseline整合を履歴ごと取り込む |

公開Previewの`local`とWeb旧保存のprovider省略は、共通入口で`local-model`に正規化する。remote providerは拒否し、session作成は`ready`までで実行・承認・成功を付与しない。依頼2000文字・メッセージ4000文字/24件・private TTLの定義も共通化する。既存保存key/versionは維持する。

Stripeのstandalone配布コピーは生成物であり、共通sourceとの一致を試験する。手修正の別実装を増やさず、生成後にSite WorkerとPC Connector ZIPを検査する。変更でcredential設定や販売停止gateを解除しない。

以下は監査で似て見えたが、異なる責務として維持する範囲である。Android/Java・Linux/Python・Webの実行器は権限モデルが違い、既存Platform契約とparity fixtureを使う。Webのレビュー待ちとnativeの実行成功を同じ「完了」に変換しない。暗号化端末backup、Web設定export、QEMU diskは復旧対象が違う。記事処理の固定原本とOS移植は既存`contracts/article-fixtures.json`で一致を検証する。Fund、Game、Material等の商品アルゴリズム、未merge PR #25・#40〜#50・#52（#39/#51を除く）の固有機能は本共通化だけでは統合済みにならない。PR #41等にある同じSite試験/README修正は本統合へ収束し、残る固有機能だけを後続でrebaseする。設計archiveの同一blobは保存を要求された原本であり、削除しない。

検証は関連unit/HTTP mock、owner/CAS・再送・署名、MCP切断/再接続、双方のhandoff契約、standalone生成物一致、全体`npm run verify`。Provider sandbox、実機OS、本番配備の成功とは分ける。結果と次の手順は`project.md`とG04へ記録する。rollbackは統合PRのrevertと既存保存schema/versionで行い、DB migrationは追加しない。


## 2026-10-05 Sky配信候補の正本統合（G04/WEB04）

G04/WEB04。利用者のmain反映指示により、専用Sites候補b896b2eの15commit差分を現行main4928b64eへ選択的に移植。既存のSIM/eSIM・Cloud料金・LiveKit音声・lazy runnerと既存migrationを保持する。Zema library、Markdown取得、CSV履歴の競合防止・世代別削除・scheduled handler、接続状態と限定Connectorの修正を取り込む。0059でlibraryを追加し、専用Siteの旧journalやschema bootstrapはコピーしない。統合候補の検証と同一SHA CIは実行中。公開Skyはv39のままで、実PC権限・新規課金・外部AI・本番Cron・本人受入は別条件。
