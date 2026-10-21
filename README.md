# avokado / RockstarOS

RockstarOSは、本人性、権限、実行、費用上限、保存・復旧を共通に扱うOSです。Skyで情報やModel・Agent・Toolを見つけて追加し、Eveで依頼、承認、進捗、成果、利用額を一つの仕事として扱います。利用者は自分のOS版を作り、鍵付きコミュニティーで共有できます。

**現在のOS設計の大元**は[「RockstarOSを再設計」チャット](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)です。[全設計ポータル](docs/rockstaros-design-portal.md)から[本体の詳細設計](docs/rockstaros-complete-design.md#redesign-thread-home-sky-eve)、[RockstarOS 1.0構成](docs/rockstaros-1.0-architecture.md)へ進んでください。確定要望は[製品ベース](docs/product-baseline.md)と[data/product-baseline.json](data/product-baseline.json)です。

## OSの構成

| 層 | 役割 |
| --- | --- |
| RockstarOS Core | 本人性、Tool権限、承認、費用上限、保存・復旧、端末適合を強制する共通runtime。 |
| Home / Sky | 投稿をニュース・発見・導入の単位にする画面。Model、Agent、Tool、共有OS版を見て追加・設定する。外部のAPI/MCP投稿は出典付きで受ける。 |
| Eve | 会話、依頼、承認、進捗、停止、成果、利用額を同じ本人・同じ仕事に結び、対応端末へ引き継ぐ。 |
| 個人・コミュニティーOS版 | ルール、見た目、LLM、Agentを版として構成・共有する。コミュニティー参加は専用鍵で制御し、Coreの権限を変更しない。 |
| 実行先・端末 | 対応する端末内LLM、本人用Linux、許可済みCloudを能力に応じて選ぶ。Pixel native、既存OS client/browser、QEMU Developer Previewは別々に受け入れる。 |

機能の追加、商品の購入、仕事の実行、外部送信、課金は別の操作です。Cloud利用は事前の見積・上限承認と明細を必要とします。モデルの出力や作者の署名をOSの権限承認へ昇格させません。

## eSIMから使う構想

eSIMは本人用のCloud Sky・Eve・Linuxサービスへ接続する入口で、OS binaryをeSIMへ格納しません。既存iOS/Android/PCでは対応clientまたはbrowserから同じ本人の仕事へ進み、正確な機種で署名済みimageとboot・復旧が受け入れられた場合にnative OSを案内します。回線、eSIM profile、本人の利用権、client導入、OS導入は別の状態として扱います。[端末別設計](docs/device-support-architecture.md) / [native統合](docs/native-os-integration.md)。

## 現在地

| 対象 | 確認済み | まだ必要な受入 |
| --- | --- | --- |
| GitHub main | RQ01〜RQ50の製品ベースと既存Web・Android・QEMUのソース/証拠。 | 指定チャットのOS設計に沿うruntime差分の統合。同一SHAのCI。 |
| 再設計の作業ブランチ | 投稿型Home/Sky、Eve、コミュニティーOS版、API/MCP受信口のローカル実装・試験記録。 | mainとの統合、実X投稿供給元、X自身のFor You、自動同期、別端末復元、公開版の実操作。 |
| Pixel 10 GL066 / frankel | 純正OS上の試験署名APKで非破壊の実再起動受入23/23。 | 全OS build、正式署名、flash/boot、dataとKeystore全損後の復元。[実機の境界](docs/phone-preview-20260911.md)。 |
| QEMU Developer Preview | 既存の独立したLinux/Buildroot系列と過去候補の受入証拠。 | 最新候補の同一imageでの起動・保存・更新・復旧と配布gate。[担当](docs/workstreams/06-native-qemu-release.md)。 |
| eSIM・Cloud・料金 | 導入、権限、見積、上限の設計と合成/限定試験。 | 実発行元、契約/利用枠、実Provider、端末間受取、本番請求を個別に受け入れる。 |

mainのRQ50と作業ブランチのRQ49、両者の月額案には差があります。OS本体は指定チャットの最新版に合わせ、料金とOS以外の要件は[Git統合監査](docs/workstreams/10-git-ci-operations.md#redesign-thread-git)で別に照合します。設計保存、ローカル実装、GitHub main統合、公開、実機OS合格は同じ状態ではありません。

## プロジェクトとサイト

- [avoado.si](https://avoado.si/) — RockstarOSとSkyの総合入口。
- [avocadomini.si](https://avocadomini.si/) — avocadoMini。
- [avocadopro.si](https://avocadopro.si/) — AI専用PC avocadoPro。
- [設計書一覧](docs/rockstaros-design-portal.md) / [Tool詳細](docs/sky-tools-complete-design.md) / [作業分野](docs/workstreams/README.md) / [実装・進捗](project.md) / [コードの場所](PROJECTS.md)。

サイトの表示、DNS/TLS、配備、実Provider、一般公開はそれぞれの読戻しで判定します。本人用localhost Labや秘密情報は公開サイトへ移しません。

## 開発と検証

Node.js 22.13以降とnpmを使用します。Webのローカル起動:

    npm ci
    npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
    npm run dev

変更の検証:

    npm ci --prefix sites/avocado-mini
    npm run project:update
    npm run design:check
    npm run verify

実装の承認・受入gate、進捗、次の作業は[project.md](project.md)と[data/project-status.json](data/project-status.json)を確認してください。GitHub mainへの統合やSites配備は別に記録します。

<!-- project-overview:start -->
Updated: 2026-10-21 / 393 task records (32 parents, 192 children, 169 standalone; 361 execution units excluding parents): 114 done, 48 in progress, 230 planned, 1 blocked
<!-- project-overview:end -->

## 権利と安全

RockstarOS 1.0の最初の配布ラベルはDeveloper Previewです。端末初期化・bootloader解除・flash、公開、実契約、実資金、外部送信には対象ごとの条件を確認します。Gitへ秘密鍵、原稿、本人データを保存しません。[配布計画](docs/release-installation-plan-20260909.md) / [権利と配布物](public-release/rockstaros/README.md)。
