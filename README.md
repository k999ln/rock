# Rock star OS — 自動化HubとWallet

tob側の自動化ツールを商品として管理するHubと、自動化で得たお金を管理するWalletに特化したOSを開発します。実行場所、料金、資格、ライセンスの違いを扱い、利用準備・日々の管理・結果とお金の確認に伴う不便を減らします。

**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ15）です。** [プロンプト作成規約](docs/prompt-playbook.md)、[OS稼働・ゲーム連携監査](docs/os-readiness-audit-20260909.md)、[最新の実行プロンプト](docs/prompts/os-operational-base-next.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を保存しています。まず現設計をQEMUで稼働・復旧まで検証できる開発OSへ進め、ゲーム交換と作者向けAPI/SDKを別に開発します。手数料0はATMの自社手数料、ゲーム料金は未定、OS月額は維持。文書保存と実装・実機/本番合格は別です。

**[設計v1.1](docs/os-hub-wallet-game-design.md)の実装は承認済みです。** [承認範囲](docs/execution-approval-20260909.md)に従い、専用branchでnativeと設計を統合しています。公開・実機・MetaMask実資金は条件付き了承を保持し、技術的な準備を検証します。達成演出は見送り、市場案は検討のみです。

**このbranchにはLinux / Buildroot / ARM64 QEMU native OSの試作があります。** main/native/設計の3入力を専用branchへ統合し、凍結した`b8287bc`から新しいOSを生成しました。native Hubの商品利用、合成Wallet、起動・保存・更新失敗からの復帰・別端末への復元は[限定受入D0〜D5](docs/os-acceptance-b8287bc-20260909.md)を通過。D6の長時間試験は未合格で、同じ条件で再試験中です。[PR #2](https://github.com/k999ln/rock/pull/2)で公開していますが、mainへの統合と実機対応は未実施です。

開発入口: [native統合方針](docs/native-os-integration.md)、[nativeの使い方](systems/rock-star-os/README.md)、[過去のsource検証](docs/native-os-validation.md)、[現在のCHECKPOINT](CHECKPOINT.md)。BlackBerry優先・正確な機種は確認中。月888 cents固定・同契約の複数端末で1回を維持します。

旧Android/AOSPの入口は [OS開発設計書](docs/os-development-design.md)。現在の製品判断には製品ベースと対象branchの現行方針を使います。

コードの現在地と再開手順: [P1実装・検証手順](docs/os-prototype.md)、[実際のTool契約](contracts/README.md)。AOSPへ組み込む設定は `android/Android.bp` と `os/device/`。これらの存在をOS起動済みの証拠にはしません。

今回の[統合後の試験結果](docs/os-operational-validation-20260909.md)と、GrapheneOSを保持する[Pixel 10向けP1アプリ試験](docs/android-trial.md)を分けて記録します。P1は記事処理の試作で、Hub＋Walletやゲーム交換の実機版ではありません。

Macからnative OSを試す入口は[専用VM用launcher](systems/rock-star-os/os/desktop/LAUNCHER-V2.md)。起動時に指定した仮想端末と画像を確認し、同じ保存データを再度開きます。ブラウザは実OSの画面を映すために使います。終了はOS内の「端末」→「電源を切る」→「確認して実行」。Wallet/ATMは合成データ専用で、MetaMask送受金には接続していません。

[ここまでの実装・検証・未達の記録](docs/implementation-checkpoint-20260909.md)に、Mac試用の最終確認、ゲーム接続clientと限定復旧、D6の失敗と再試験、GX00の残課題をまとめています。ゲーム通貨交換は設計段階です。

正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。旧ローカル作業名は `gg`。現在の実装再開先は `codex/operational-base-20260909` で、SSD上の旧checkoutを最新と仮定しません。製品は「Rock star / avocadomini」の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。

## このbranchの作業進捗

<!-- project-status:start -->
最終更新: 2026-09-09 / native試用版・ゲーム接続/復元統合・導入可能版の準備 / 完了 14/34件

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了 | [記録](docs/reference-repositories.md) |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了 | [記録](project.md) |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了 | [記録](tests/workflow.test.mjs) · [記録](scripts/check-work-api.mjs) |
| R04 | README・設計進捗の同期とCI検証 | 完了 | [記録](scripts/project-status.mjs) · [記録](.github/workflows/ci.yml) |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了 | [記録](docs/validation.md) |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了 | [記録](docs/validation.md) |
| R07 | 本人限定のSitesへ公開・本番確認 | 停止中: sites/mainに別の仕事API・0002移行・アプリUIが存在。追加機能を保持する統合方針の確認が必要 | [記録](docs/deployment-integration.md) |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了 | [記録](project.md) · [記録](docs/validation.md) · [記録](docs/deployment-integration.md) |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了 | [記録](docs/os-development-design.md) |
| OS02 | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 未着手 | [記録](docs/os-development-design.md) |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| B01 | Hub＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/progress-audit-20260909.md) · [記録](docs/prompt-playbook.md) · [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/validation.md) |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| B02 | 既存商品のHub実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B05 | Wallet連携基礎を使ったHub縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/hub-wallet-pc-comparison-20260909.md) · [記録](docs/evidence/hub-wallet/b05-pc-machine-20260909/report.json) |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/os-readiness-audit-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/validation.md) |
| V01 | 最新統合sourceからQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す | 進行中 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/os-operational-validation-20260909.md) · [記録](docs/evidence/os-base/startup-update-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/registry-negative-b8287bc.json) · [記録](docs/os-acceptance-b8287bc-20260909.md) · [記録](systems/rock-star-os/os/desktop/LAUNCHER-V2.md) |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 進行中 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx00-owner-isolation-adr.md) · [記録](docs/evidence/gx00/integration.json) · [記録](systems/rock-star-os/os/wallet_backend/FENCE.md) · [記録](docs/gx00-connection-wire-v1.md) · [記録](docs/evidence/gx00/game-protocol-review.json) · [記録](docs/game-connection-node-wire-20260909.md) · [記録](docs/gx00-connections-runtime.md) · [記録](docs/evidence/gx00/game-connections-root.json) · [記録](docs/gx00-legacy-game-basis.md) · [記録](systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md) · [記録](docs/evidence/gx00/current-copy-foundations-root.json) · [記録](docs/gx00-current-game-restore.md) · [記録](docs/gx00-owner-connection-client.md) · [記録](docs/evidence/gx00/current-game-integration-root.json) · [記録](docs/implementation-checkpoint-20260909.md) |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-contract-implementation-plan.md) |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | BlackBerryの型番・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) |
| N04 | BlackBerry実機だけでHub取得・実行・更新・復旧 | 未着手 | [記録](docs/native-os-integration.md) |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 進行中 | [記録](docs/release-installation-plan-20260909.md) |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 未着手 | [記録](docs/release-installation-plan-20260909.md) |

段階ゲート（作業全体の完了とは別判定）

| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| B04-INTEGRATED | B04 | 承認後、main/native/設計reviewの3入力と入口を統合 | 合格 | — | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| V01-BOOT | V01 | OS起動・安全基礎（V01全体の合格ではない） | 合格 | B04-INTEGRATED | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/freeze-b8287bc.json) · [記録](docs/evidence/os-base/boot-b8287bc.json) · [記録](docs/evidence/os-base/platform-b8287bc.json) · [記録](docs/evidence/os-base/native-ui-b8287bc.json) |
| B02-NATIVE | B02 | 既存native商品1件をHubで実処理・保存 | 合格 | V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03-FIXTURE | B03 | 単一ownerの合成Wallet・商品/費用/売上状態の基礎 | 合格 | B02-NATIVE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| V01-ACCEPT | V01 | 同一OS候補でD0〜D6縦断合格 | 未合格 | V01-BOOT · B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| B03-PROVIDER | B03 | 実provider/認証済み収益（別の権限・条件が必要） | 未合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| B05-COMPARE | B05 | Wallet基礎後のPC比較/再試験。実機価値は別判定 | 未合格 | B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| GX00-ISOLATION | GX00 | ADR・複数owner分離/本人接続・互換/復旧の合成検証 | 未合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/gx00/integration.json) |
| GX01-CONTRACT | GX01 | 複数owner/gameの交換契約と両台帳fixture | 未合格 | GX00-ISOLATION | [記録](docs/prompts/os-operational-base-next.md) |
| GX01-UI | GX01 | OS上の交換操作と台帳変更後D4/D5再検証 | 未合格 | GX01-CONTRACT · V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) |
| DX01-SDK | DX01 | 共通SDK・2作者/2game/2owner・fresh導入測定 | 未合格 | GX01-CONTRACT | [記録](docs/prompts/os-operational-base-next.md) |
| PREVIEW-INSTALL | RLS01 | fresh環境でDeveloper Previewの導入・起動・保存・復旧・削除を完走 | 未合格 | V01-ACCEPT | [記録](docs/release-installation-plan-20260909.md) |
| DEVICE-INSTALL | RLS02 | 対象1機種でflash・初回起動・OTA rollback・純正復旧を完走 | 未合格 | PREVIEW-INSTALL | [記録](docs/release-installation-plan-20260909.md) |

次の作業: 最新PRのnative source-tests timeoutとD6未合格を解消し、既存private VMへ依存しないfresh Mac/PC向けQEMU Developer Previewを作る。導入・起動・終了・再開・backup・削除を同一配布物で検証後、CM表現を確定する。物理端末は正確な1機種・variantを固定してから別ゲートで進める。
<!-- project-status:end -->

進捗の正本は `data/project-status.json`。作業ごとに更新し、`npm run project:update` でREADMEとproject.mdを同期します。`npm run project:check` は更新漏れを検出します。

R2の画面確認と修正はGitHubへ保存済みですが、**本番サイトへの反映は未実施**です。配信先だけにあるアプリUI・実行管理・手入力台帳と仕事API/DB移行が重なるため、上書きせず停止しました。保持する機能と再開手順は [統合設計](docs/deployment-integration.md) を参照。

## 既存Web/PC版で現在できること

- ジャンル・キーワードからファンドと自動化ツールを検索。
- Mr.由来のココナラ案件チェック、記事の無料版作成、出典整理をブラウザ内で実行。
- Mr.由来の納品記録照合を含むPC用無料パックを配布。元コード4件をMIT・取得commit・ハッシュ付きで同梱。
- 3件の外部OSS候補も引き続き掲載。
- マイファンドの選択と配分計画。旧マイツール用の保存・導入プラン関数も保持。
- Ethereum互換の注入型ウォレットでアドレス接続。キャンセル、アカウント変更、切断を処理。
- 月$8.88相当の利用料と、電力・通信・API費用の試算。
- ファンドをホームに配置。参加・配分計画・試算条件と実行履歴をアカウントごとに保存。
- 「仕事を進める」から記事販売準備・ココナラ納品準備を作成し、手順・試行履歴・最終確認をアカウント別に保存して再開。
- 基本分配・ブースト・共同留保を、共通収益の範囲内で試算。入金・送金は未接続。
- 同じ4ツールをstdio MCPでCodexから実行。PC接続アプリを起動するとサイトからもMCPでワンボタン実行。
- GitHubとHugging Faceの公開メタデータを収集する管理用コマンド。

ファンドの参加・配分・試算条件、単独ツールの実行メタデータ、仕事の進捗はSitesのD1に保存します。旧マイツール用のローカル保存関数も互換用に保持しています。接続アドレスは保存せず、サーバーへ送信しません。ウォレット接続はログイン認証・実名本人確認・送金認可ではありません。

## 仕事の進め方（現行Web版）

1. ホームの「仕事を進める」から `/work` を開き、サインインします。PCではヘッダー、スマホでは検索・カテゴリの下に入口を表示します。
2. 仕事名と「記事の販売準備」または「ココナラ納品準備」を選んで作成します。
3. 表示された手順を実行します。サンプル・失敗・条件不一致は記録されますが、手順は進みません。納品記録照合には最新版のPC接続パックが必要です。
4. 結果を確認してコピーまたはダウンロードし、次の手順へ進みます。原稿は自動で次へ渡されず、タブを閉じると未保存本文は失われます。
5. 全手順の通過後に確認メモを入力して完了します。応募・外部納品・売上発生を意味する完了ではありません。

保存するのは仕事名・確認メモ・実行メタデータで、原稿や成果物は保存しません。名前やメモに秘密情報を入れないでください。仕事は最新100件、試行は1仕事につき最大200件です。本文保存・古い仕事のページ送り・削除は今後の拡張です。仕事内の実行は仕事履歴に記録し、ホームの単独ツール実行履歴には二重計上しません。

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
```

Vinext / React / Cloudflare Workers / Sites。Sitesのサイト設定は `.openai/hosting.json`。開発サーバーの表示したURLを開く。秘密鍵やサービス認証情報は追加しない。

`verify` は進捗の同期・型・プロダクトコードのlint・自動テスト・本番ビルド・ローカルWorker/D1のAPI検証を実行します。API検証はMiniflareで本番APIバンドルを直接起動し、一時DBと合成ユーザーだけを使います。本番データには接続せず、資産ルーティング・開発プロキシ・画面操作は対象外です。GitHub Actionsも同じコマンドで検証します。`npm run lint` は未変更の生成済みUI部品も含む全体検査で、既存の指摘が残っています。

DB変更時は `npm run db:generate -- --name=変更名` で移行を生成し、SQLを確認します。外付けSSDのmacOSメタデータを除外して生成するラッパーです。既存の移行SQLを書き換えず、追加入力として管理します。

`origin` はGitHubの `k999ln/rock`、`sites` は既存サイトの配信用です。GitHubへのpushだけではサイトは更新されません。本番へ適用するDB移行もSites公開時に別途確認します。

```sh
npm run discover -- transcription
```

GitHubのリポジトリ検索とHugging Faceのモデル検索を並行実行し、`data/discovered.json` に保存。認証なしの公開APIなのでレート制限あり。失敗は記録し非ゼロ終了、成功した情報も保持。取得結果は未審査データであり、コードを実行せず、公開カタログへ自動追加しない。カタログは `lib/catalog.ts` で明示的に管理。

Product Hunt APIは商用利用条件の確認前のため未接続。サービスの公開ページへのリンクのみ。

## 次に追加する順番

設計v1.1の実装承認を受け、次の順番で進めます。現在の状態は上記の段階ゲートとCHECKPOINTを参照してください。

1. main・native開発PRと同一SHAの証拠を確認し、B04で分離作業branchへベースとnativeを統合して全入口・優先順位を同期する。
2. V01で最新sourceから新しいOSをbuildし、QEMUの起動/安全基礎を検証。既存商品・Wallet基礎を接続してD0〜D6の操作/保存/通常終了/再起動/復旧を完了させる。
3. B02/B03/B05で商品条件・資格・実行先と、費用/収益照合・既存Walletを接続し、実利用の改善前後/PC比較を測る。fixture成功と実収益/実機価値は別判定。
4. GX00で複数owner分離・本人接続・台帳互換を通し、GX01でATMから独立したゲーム交換を合成serverで試験し、DX01で作者向けAPI/SDK・サンプル・導入体験を検証。ゲーム料金/方向は未確定、ATM自社手数料0を保持。
5. GX02実ゲームsandbox、BlackBerry適合、実PC/cloud/provider、実資金・本番は個別ゲート。旧Android/AOSPは別トラックとして保持する。

初期APKでの試験は補助であり、それだけをOS完成とは扱いません。既存のSites公開停止はOSの設計・独立した仮想OS開発を妨げません。端末購入・初期化・書込・サービス契約は、この設計書作成では実施していません。

詳細は `docs/product.md`、`docs/architecture.md`、`docs/research.md`、`docs/validation.md` を参照。

## 配布条件

GitHubの `rock` は公開リポジトリです。Rock star独自コードの再利用ライセンスは未選定であり、ソースを閲覧できることとOSSとしての再利用許諾は別です。カタログで紹介するOSSは各公式ライセンスに従い、モデルの重みは個別に確認します。Mr.から取り込んだ4ファイルは `vendor/mr/LICENSE` のMIT条件で同梱しています。PCパックのRock starアダプターとサンプルも同じMIT条件で配布します。認証情報や過去の案件データは含めていません。

## Mr.から取り込んだツール

ブラウザで3ツール、PCで4ツールを使えます。`docs/mr-integration.md` に取得元と移植差分、`toolkits/mr/README.md` に実行方法があります。

```sh
python3 scripts/package-mr.py
python3 toolkits/mr/rock_star_tools.py coconala-check --input toolkits/mr/examples/coconala.json
```

PCパックは `public/toolkits/mr-toolkit.zip`。元コードのハッシュが変わると実行・再梱包は失敗します。MCPの出典整理は固定CLIの別プロセスで処理し、入力・出力各65,536 UTF-8バイト、処理3秒、同時1件に制限します。macOSはPython 3.13以上、Linuxは3.10以上の通常利用者が対象です。Windowsの新しい出典整理接続は未対応です。native Hub接続と再起動をまたぐ重複実行防止は残件です。PCだけの再現手順と受入範囲は [PC実処理接続](docs/pc-citations-adapter.md) を参照してください。

詳しい今回の動作と会計モデルは `docs/fund-and-mcp.md` を参照。

ローカル保存領域の初期化: `npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc`。プレビューの保存には `/signin-with-chatgpt?return_to=/` から標準のローカルサインインを使います。
