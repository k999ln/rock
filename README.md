# Rock star OS — SkyとWallet

多機種対応は、**共通RockstarOS Core＋機種／SKU別Device Support Package**で進めます。提供区分は完全なOS image、Android GSI実験版、既存OS上のclient、非対応を混同しません。Pixel候補は未確定、BlackBerryは機種別調査、iPhone／iPadはOS置換ではなくclientです。[多機種対応設計](docs/device-support-architecture.md)／[機械可読の対応台帳](data/device-support-matrix.json)。

スマホ実機版の開発を開始しました。現在はソース統合準備で、書込み可能なOSは未生成です。直近相談のPixel 7／`panther`と既存設定のPixel 10／`frankel`が不一致のため、実機確認前に対象を確定しません。lockの機種/SKU確認が完了するまでfull OS buildは停止し、build入口は64 GiB RAM／400 GiB空きとlock由来sourceの再検証を要求します。[2026-09-12の進捗再監査](docs/current-state-20260911.md#2026-09-12--github実装実機版ビルド環境の再監査)／[ビルド環境・実装・次の手順](docs/phone-preview-20260911.md)。

公開設定・本人限定サイトの状況は[今回の設定記録](docs/owner-setup-20260911.md)を参照。

tob側の自動化ツールを商品として管理するSkyと、自動化で得たお金を管理するWalletに特化したOSを開発します。Skyは単なるツール一覧ではなく、**探す→権限・料金を確認→端末/PC/Cloudへ実行→停止→結果と記録を受け取る**までを一か所につなぎます。[Skyの図・優位性・現在の収録ツール](docs/sky.md)を参照してください。

**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ31）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定です。Skyの8.88 USDは先払い月額ではなく、検証済み自動化収益からだけ回収する月間上限です。

ホームの設定アプリには「システム診断と保全」があります。通信・安全な接続・保存・暗号化・更新・通知・PWA表示・API・PC Connectorをその場で診断し、通知テスト、保存保護、個人情報なしの診断共有、暗号化バックアップ・復元、安全なホーム設定初期化を実行できます。PWAは固定identity/scopeとiPhone/Android向けinstall iconを持ち、新版は自動即時切替せず、「更新を確認」後に本人が「更新を適用」を押した場合だけ切り替えます。公開条件はAndroid互換、GMS、物理端末、署名、OSS、無線規制、マイナンバーを別gateで表示します。これはWeb/PWAの運用機能であり、物理端末のBSP・bootloader・正式署名鍵・外部Provider接続の代わりではありません。

[最低公開条件](docs/release-minimum-gates.md)は、本人限定Web/PWA、一般公開Web/PWA、QEMU配布、Android実機、iPhone/iPad client、マイナンバーを別々に判定します。本人限定Web/PWAは、8 HTTP防御headerとPWA manifest・3 iconをローカルproductionの8経路で実測済みですが、本人限定Sitesの最新版同期と実response再読取り待ちで4/5です。[QEMU rc2の完了監査](docs/qemu-release-completion-audit-20260912.md)は6/10要件合格です。[Android実機・マイナンバー監査](docs/android-and-personal-number-gates-20260913.md)はそれぞれ0/5と1/7で、GMSなしAOSP境界と番号・カード画像の無効化を維持します。`npm run release:check`はこれらの監査を公開台帳へ結合し、旧nativeの転用、証拠なしの端末互換・GMS・販売可能表示、未承認の個人番号取得を拒否します。`npm run release:signing:check`は候補準備・法務承認・保護署名・本人署名の64公開fixture回帰を実行し、全体verifyへ含まれます。`npm run release:sbom`はWeb/npm、現在のrc2 native、旧nativeのCycloneDXをGit対象外の別fileへ生成します。Web依存は887 entry／854 unique componentをlock SHAへ固定し、MPL/LGPL・選択式・CC-BYの計47件を追加review対象として保持します。現在はready 0/6です。

SkyのWallet画面には、検証済み自動化収益の精算状況を追加しました。独立WorkerがExecution Receipt、Provider入金参照、証拠hashを持つ署名済みEarning Receiptだけを受け、実費の後から月最大888 USD centsを回収し、残額の払出し指図を作ります。売上0時の請求、未達分の債務化・翌月繰越、カード定期請求はありません。先払いCheckout APIは停止済みです。販売・決済・払出しProviderのsandbox接続と本番条件は未完了です。[実装とProvider接続手順](docs/sky-billing.md)。

[8原則に基づくRockstarOS 1.0設計](docs/rockstaros-1.0-strategy.md)を追加しました。現ベースを維持し、一つの商品で実行・成果・費用・復旧まで確認できる体験を検証します。初期対象の文章系個人事業主と既存引用整理は検証仮説。配布/実用の優先順位、試用指標、CM導線、責任分担を具体化し、未実証の需要や本番利用可能性は主張しません。

**[設計v1.1](docs/os-sky-wallet-game-design.md)の実装は承認済みです。** [承認範囲](docs/execution-approval-20260909.md)に従い、専用branchでnativeと設計を統合しています。公開・実機・MetaMask実資金は条件付き了承を保持し、技術的な準備を検証します。達成演出は見送り、市場案は検討のみです。

**このbranchにはLinux / Buildroot / ARM64 QEMU native OSの試作があります。** main/native/設計の3入力を統合した[PR #2](https://github.com/k999ln/rock/pull/2)を起点に開発しています。旧`b8287bc`の[限定受入D0〜D5](docs/os-acceptance-b8287bc-20260909.md)を保持し、run44は元planの5boot・61jobs・3641.769秒と正常停止を独立照合して回収しました。旧合格とは別に、Game統合9ab候補で[D0〜D6の限定受入](docs/os-acceptance-9abf78a-20260910.md)を完了しました。mainへの統合と実機対応は未実施です。

開発入口: [native統合方針](docs/native-os-integration.md)、[nativeの使い方](systems/rock-star-os/README.md)、[過去のsource検証](docs/native-os-validation.md)、[現在のCHECKPOINT](CHECKPOINT.md)。以前のBlackBerry希望は型番未確認。現在のPixel 10／GrapheneOS候補も機種/SKUの確認待ちです。月888 cents固定・同契約の複数端末で1回を維持します。

旧Android/AOSPの入口は [OS開発設計書](docs/os-development-design.md)。現在の製品判断には製品ベースと対象branchの現行方針を使います。

コードの現在地と再開手順: [P1実装・検証手順](docs/os-prototype.md)、[実際のTool契約](contracts/README.md)。AOSPへ組み込む設定は `android/Android.bp` と `os/device/`。これらの存在をOS起動済みの証拠にはしません。

今回の[統合後の試験結果](docs/os-operational-validation-20260909.md)と、GrapheneOSを保持する[Pixel 10向けP1アプリ試験](docs/android-trial.md)を分けて記録します。P1は記事処理の試作で、Sky＋Walletやゲーム交換の実機版ではありません。

Mac向けrc2の入口は[導入ガイド](docs/preview-installation-ja.md)。既存VM向けの[専用launcher](systems/rock-star-os/os/desktop/LAUNCHER-V2.md)も保持しています。起動時に指定した仮想端末と画像を確認し、同じ保存データを再度開きます。ブラウザは実OSの画面を映すために使います。終了はOS内の「端末」→「電源を切る」→「確認して実行」。Wallet/ATMは合成データ専用で、MetaMask送受金には接続していません。

[前日の実装・検証・未達の記録](docs/implementation-checkpoint-20260909.md)を履歴として保持しています。現在のGX00は実TLSで複数owner/game分離の必須受入を通過し、GX01の署名quote・別購入承認・両台帳とnative UIを統合しました。SDK・Game profile・停止/復旧と実OSの限定受入は[最新記録](docs/release-followup-20260910.md)に保存済みで、本番ゲームや実資金には接続していません。

Developer Previewの[導入・初回実行・復旧ガイド](docs/preview-installation-ja.md)と[既知制限](docs/preview-release-notes.md)を作成しています。`npm run dev` のローカル `/rockstaros` と `/rockstaros/guide` で案内を確認できます。最終9ab候補の実画面と90.04秒の技術デモを案内に使用しています。ダウンロード一般公開は正式署名・許諾・最終配布受入と公開承認待ちです。

正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。旧ローカル作業名は `gg`。現在の実装再開先は `codex/rockstaros-launch-candidate-20260910` で、SSD上の旧checkoutを最新と仮定しません。製品は「Rock star / avocadomini」の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。

**CMの現在状態（2026-09-11）:** 最新の回答は制作途中です。完成・選定・内容照合・掲載が残ります。9月10日の完成済みという回答は過去の[履歴](docs/release-followup-20260910.md)として保持します。「追加1〜2日」はLICENSE／Sitesの待ちを除くQEMU版仕上げの条件付き概算で、確定公開日ではありません。[完了範囲・見積もり・残件の詳細](docs/release-followup-20260910.md)。

## このbranchの作業進捗

<!-- project-status:start -->
最終更新: 2026-09-13 / 本人限定Web/PWAを4/5へ進め、8 HTTP防御headerを5 production経路で実測。全6配布対象は証拠不足を残してBLOCKED / 完了 51/74件

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| SKY01 | 旧名称をSkyへ全面改称し、選択・許可・実行先・停止・結果を一つにする価値と収録ツールを可視化 | 完了 | [記録](docs/sky.md) · [記録](components/sky-workspace.tsx) · [記録](scripts/check-sky.mjs) |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了 | [記録](app/sky/publish/page.tsx) · [記録](components/sky-publisher-form.tsx) · [記録](app/api/sky/submissions/route.ts) · [記録](tests/sky-submission.test.mjs) |
| SKY03 | MCP接続・周辺先行技術を調査し、特許出願可能性を高める技術設計を保存 | 完了 | [記録](docs/sky-mcp-architecture.md) · [記録](systems/rock-star-os/docs/MCP-HUB-INTEGRATION.md) |
| SKY04 | tob無料のConnection Passport・実行契約・ToB/ToC貢献分配を一画面で説明するSky Networkフロント | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SKY05 | Sky画面のsidebarを廃止し、MCP接続・管理とToB掲載をSky本体の操作面へ統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/sky/network/page.tsx) · [記録](app/sky/publish/page.tsx) |
| SKY06 | Sky内MCPを実在するPC接続・既存4自動化・3ステップ導入画面へ統合 | 完了 | [記録](components/sky-mcp-center.tsx) · [記録](components/device-connection.tsx) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](scripts/verify-mcp-flow.mjs) |
| SKY07 | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) |
| SKY08 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY09 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了 | [記録](components/sky-workspace.tsx) · [記録](app/api/sky/connections/route.ts) · [記録](docs/sky-identity-connection.md) |
| SKY10 | Skyをアプリ選択と接続へ絞り、Chatを依頼・状況・結果の受取画面として分離 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/chat/page.tsx) · [記録](app/polymarket/page.tsx) |
| SKY11 | MCP掲載前診断とPC接続の互換性・初回導線を改善 | 完了 | [記録](lib/mcp-inspection.ts) · [記録](app/api/sky/mcp/inspect/route.ts) · [記録](lib/device.ts) · [記録](components/sky-publisher-form.tsx) · [記録](components/device-connection.tsx) · [記録](tests/mcp-inspection.test.mjs) · [記録](tests/device-lifecycle.test.mjs) |
| SKY12 | ChatをSky Auto既定の一画面へ整理し、事前のアプリ選択を任意化 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](docs/sky-identity-connection.md) |
| HOME01 | iPhone着想のホーム、端末内カスタマイズ、OS運用設定アプリを実装 | 完了 | [記録](app/page.tsx) · [記録](app/sky/page.tsx) · [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](app/settings/page.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-settings.module.css) · [記録](docs/product-baseline.md) |
| SYS01 | 端末診断・暗号化設定バックアップ・復元・Web更新確認を設定へ実装 | 完了 | [記録](app/settings/system/page.tsx) · [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS02 | 通知・保存保護・診断共有・安全な初期化と公開審査gateを設定へ実装 | 完了 | [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS03 | 公開方法別の最低条件を機械判定し、Web/npm SBOMと設定画面へ統合 | 完了 | [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](components/system-maintenance.tsx) |
| SYS04 | QEMU rc2を同一候補10要件へ固定し、rc2固有native SBOMを生成して旧inventoryの誤転用を拒否 | 完了 | [記録](data/qemu-release-audit.json) · [記録](data/qemu-rc2-legal-info/manifest.csv) · [記録](data/qemu-rc2-legal-info/host-manifest.csv) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/qemu-release-completion-audit-20260912.md) · [記録](components/system-maintenance.tsx) |
| SYS05 | 候補準備・法務承認・保護署名・本人署名の64拒否境界試験を全体verifyへ統合 | 完了 | [記録](scripts/check-release-signing.mjs) · [記録](scripts/release_signing.py) · [記録](scripts/release_signing_owner.py) · [記録](scripts/prepare_release_candidate.py) · [記録](scripts/verify_owner_legal_approval.py) · [記録](tests/test_release_signing.py) · [記録](tests/test_release_signing_owner.py) · [記録](tests/test_prepare_release_candidate.py) · [記録](tests/test_owner_legal_approval.py) · [記録](docs/release-signing-operations.md) |
| SYS06 | Android物理端末とマイナンバー連携を独立監査し、証拠なしの互換・GMS・販売・個人番号有効化を拒否 | 完了 | [記録](data/android-physical-release-audit.json) · [記録](data/personal-number-release-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/android-and-personal-number-gates-20260913.md) · [記録](docs/release-minimum-gates.md) |
| SYS07 | Web/PWAのHTTP防御を正本化し、Worker・static asset両経路の実responseを検査 | 完了 | [記録](data/web-security-policy.json) · [記録](next.config.ts) · [記録](public/_headers) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/web-security-policy.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260913.json) · [記録](docs/validation.md) |
| SYS08 | PWA新版の自動即時切替を廃止し、本人確認後の適用・旧cache整理・再読込へ変更 | 完了 | [記録](public/sw.js) · [記録](components/system-maintenance.tsx) · [記録](tests/service-worker-update.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260913.json) · [記録](docs/validation.md) |
| SYS09 | PWAの同一性・scope・iPhone/Android向けinstall iconを固定し、実HTTP manifestを検査 | 完了 | [記録](app/manifest.ts) · [記録](public/rock-icon-192.png) · [記録](public/rock-icon-512.png) · [記録](public/rock-icon-maskable.svg) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/pwa-installability.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260913.json) · [記録](docs/validation.md) |
| SYS10 | Web第三者依存のlock hash・unique component・要review license分類を公開gateへ固定 | 完了 | [記録](package-lock.json) · [記録](data/web-third-party-license-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
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
| OS02 | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 進行中 | [記録](docs/os-development-design.md) · [記録](docs/phone-preview-20260911.md) |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| B01 | Sky＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/progress-audit-20260909.md) · [記録](docs/prompt-playbook.md) · [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/validation.md) |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) · [記録](docs/sky-patent-assistant-20260912.md) · [記録](tests/patent-assistant.test.mjs) |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B05 | Wallet連携基礎を使ったSky縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/hub-wallet-pc-comparison-20260909.md) · [記録](docs/evidence/hub-wallet/b05-pc-machine-20260909/report.json) |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/os-readiness-audit-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/validation.md) |
| V01 | 旧9abf78a候補のQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す（現rc2へ転用しない） | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/os-operational-validation-20260909.md) · [記録](docs/evidence/os-base/startup-update-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/registry-negative-b8287bc.json) · [記録](docs/os-acceptance-b8287bc-20260909.md) · [記録](systems/rock-star-os/os/desktop/LAUNCHER-V2.md) · [記録](docs/evidence/rls01/final-d6-ci-20260910.json) · [記録](docs/evidence/rls01/final-d6-root-audit-20260910.json) · [記録](docs/os-local-final-20260910.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx00-owner-isolation-adr.md) · [記録](docs/evidence/gx00/integration.json) · [記録](systems/rock-star-os/os/wallet_backend/FENCE.md) · [記録](docs/gx00-connection-wire-v1.md) · [記録](docs/evidence/gx00/game-protocol-review.json) · [記録](docs/game-connection-node-wire-20260909.md) · [記録](docs/gx00-connections-runtime.md) · [記録](docs/evidence/gx00/game-connections-root.json) · [記録](docs/gx00-legacy-game-basis.md) · [記録](systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md) · [記録](docs/evidence/gx00/current-copy-foundations-root.json) · [記録](docs/gx00-current-game-restore.md) · [記録](docs/gx00-owner-connection-client.md) · [記録](docs/evidence/gx00/current-game-integration-root.json) · [記録](docs/implementation-checkpoint-20260909.md) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-contract-implementation-plan.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | 実機候補1機種の型番/SKU・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| N04 | BlackBerry実機だけでSky取得・実行・更新・復旧 | 未着手 | [記録](docs/native-os-integration.md) |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 完了 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) · [記録](docs/release-followup-20260910.md) |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 進行中 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH01 | TLS／累積timeoutの原因と最終CIの照合 | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH02 | 全同梱物inventory・対応source・製品LICENSEの明示決定 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH03 | production署名・保護環境・失効運用 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH04 | Sites履歴のコード統合・新規本人限定サイト・Sky改善 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/sites-owner-private-20260913.json) |
| LCH05 | 制作中CMの完成待ち・内容照合・導入案内への接続 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH07 | 同一最終候補の再現配布・導入・復旧リハーサル | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH08 | ローカルOSバックエンドの安全終了・ヘルスチェック・再起動時のreceipt復元を検証 | 完了 | [記録](docs/backend-launch-20260912.md) · [記録](systems/rock-star-os/scripts/verify-backend-launch.py) · [記録](systems/rock-star-os/tests/test_hub.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) |
| FB01 | Instagram運用・受注型ブランド管理をRockstarOS Hub商品とMCPへ統合 | 完了 | [記録](docs/fashion-brand-ops-integration.md) |
| FB02 | 売上・数量・粗利・期限からCampaign Autopilotの計画と次アクションを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB03 | DM履歴・購買意向・顧客情報からAI Sales Conciergeと営業パイプラインを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB04 | 入金確認後の制作計画・原価・納期・工程をProduction Cockpitで管理 | 完了 | [記録](toolkits/fashion-brand-ops/db/migrations/003_autonomous_operations.sql) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB05 | 改善版Skyの役割フィードへブランド運営役と38 MCP操作を統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| BIL01 | 先払い月額を停止し、検証済み自動化収益からだけ実費後に月最大888 centsを精算 | 完了 | [記録](docs/sky-billing.md) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](services/sky-billing/migrations/0002_earnings_settlement.sql) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| BIL02 | 有償自動化商品と販売・決済・払出しProvider sandboxを接続し、Earning Receiptから実送金まで受入 | 進行中 | [記録](docs/sky-billing.md) |
| BIL03 | メルカリを最初の収益経路として出品準備・費用計算・承認・未照合売上の安全な状態管理をSkyへ追加 | 完了 | [記録](docs/mercari-revenue-loop.md) · [記録](lib/mercari-revenue.ts) · [記録](app/api/revenue/mercari/route.ts) · [記録](components/mercari-revenue-starter.tsx) · [記録](tests/mercari-revenue.test.mjs) |

段階ゲート（作業全体の完了とは別判定）

| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| B04-INTEGRATED | B04 | 承認後、main/native/設計reviewの3入力と入口を統合 | 合格 | — | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| V01-BOOT | V01 | 旧b8287bc候補のOS起動・安全基礎（現rc2の全体合格ではない） | 合格 | B04-INTEGRATED | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/freeze-b8287bc.json) · [記録](docs/evidence/os-base/boot-b8287bc.json) · [記録](docs/evidence/os-base/platform-b8287bc.json) · [記録](docs/evidence/os-base/native-ui-b8287bc.json) |
| B02-NATIVE | B02 | 既存native商品1件をSkyで実処理・保存 | 合格 | V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03-FIXTURE | B03 | 単一ownerの合成Wallet・商品/費用/売上状態の基礎 | 合格 | B02-NATIVE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| V01-ACCEPT | V01 | 旧9abf78a候補でD0〜D6縦断合格（現rc2へ転用しない） | 合格 | V01-BOOT · B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| B03-PROVIDER | B03 | 実provider/認証済み収益（別の権限・条件が必要） | 未合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| B05-COMPARE | B05 | Wallet基礎後のPC比較/再試験。実機価値は別判定 | 未合格 | B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| GX00-ISOLATION | GX00 | ADR・複数owner分離/本人接続・互換/復旧の合成検証 | 合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/gx00/integration.json) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01-CONTRACT | GX01 | 複数owner/gameの交換契約と両台帳fixture | 合格 | GX00-ISOLATION | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) · [記録](docs/evidence/release-candidate-9abf78a/native-ci.json) · [記録](docs/gx01-dx01-acceptance-20260910.md) |
| GX01-UI | GX01 | OS上の交換操作と台帳変更後D4/D5再検証 | 合格 | GX01-CONTRACT · V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| DX01-SDK | DX01 | 共通SDK・2作者/2game/2owner・fresh導入測定 | 合格 | GX01-CONTRACT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| PREVIEW-INSTALL | RLS01 | 旧9abf78aのfresh導入・起動・保存・復旧・削除を完走（現rc2へ転用しない） | 合格 | V01-ACCEPT | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) |
| DEVICE-INSTALL | RLS02 | 対象1機種でflash・初回起動・OTA rollback・純正復旧を完走 | 未合格 | PREVIEW-INSTALL | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) |

次の作業: 所有者が最新版の本人限定Sites同期、製品license、OWNER_MANUAL本番鍵生成を明示承認した後、Sites実response再読取りとQEMU同一最終archiveの署名後受入を行う。
<!-- project-status:end -->

進捗の正本は `data/project-status.json`。作業ごとに更新し、`npm run project:update` でREADMEとproject.mdを同期します。`npm run project:check` は更新漏れを検出します。

R2の画面確認と修正はGitHubへ保存済みですが、**本番サイトへの反映は未実施**です。配信先だけにあるアプリUI・実行管理・手入力台帳と仕事API/DB移行が重なるため、上書きせず停止しました。保持する機能と再開手順は [統合設計](docs/deployment-integration.md) を参照。

## Web/PC版のSkyと既存Sites機能

保存済みSites source `c6942d5ef72e9dd16345b9363e68e0e18ca25079` の実行管理、利用停止/再開、PC接続管理、手入力収支、PWAを統合中。`/api/jobs` はSitesの実行受付を保持し、仕事の手順管理は `/api/work-jobs` へ分離。手入力金額は実残高・払出可能額ではありません。既存Sitesの実DB適用履歴はアクセス復旧後に照合します。

## 既存Web/PC版で現在できること

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

DB変更時は `npm run db:generate -- --name=変更名` で移行を生成し、SQLを確認します。外付けSSDのmacOSメタデータを除外して生成するラッパーです。既存の移行SQLを書き換えず、追加入力として管理します。

`origin` はGitHubの `k999ln/rock`、`sites` は既存サイトの配信用です。GitHubへのpushだけではサイトは更新されません。本番へ適用するDB移行もSites公開時に別途確認します。

```sh
npm run discover -- transcription
```

GitHubのリポジトリ検索とHugging Faceのモデル検索を並行実行し、`data/discovered.json` に保存。認証なしの公開APIなのでレート制限あり。失敗は記録し非ゼロ終了、成功した情報も保持。取得結果は未審査データであり、コードを実行せず、公開カタログへ自動追加しない。カタログは `lib/catalog.ts` で明示的に管理。

Product Hunt APIは商用利用条件の確認前のため未接続。サービスの公開ページへのリンクのみ。

## 次に進める作業

現在は[スマホ版とローンチ候補の再開指示](docs/prompts/rock-current-next-20260911.md)に従います。機種/SKU、Linux環境、クラウド費用の回答待ちを記録し、スマホ版移植とQEMU配布の残件を分けて進めます。

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

GitHubの `rock` は公開リポジトリです。Rock star独自コードの再利用ライセンスは未選定であり、ソースを閲覧できることとOSSとしての再利用許諾は別です。カタログで紹介するOSSは各公式ライセンスに従い、モデルの重みは個別に確認します。Mr.から取り込んだ4ファイルは `vendor/mr/LICENSE` のMIT条件で同梱しています。PCパックのRock starアダプターとサンプルも同じMIT条件で配布します。認証情報や過去の案件データは含めていません。

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
