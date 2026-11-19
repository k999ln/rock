# Sky市場・MCP接続の開発実行プロンプト

作成: 2026-10-21（America/New_York）。主担当は Sky / MCP、既存SKY14・SKY15・SKY20・SKY21とBIL02のROCK。これは次の実装担当への指示である。この文書の保存を実装、実Provider接続、実課金、一般公開の完了に数えない。

## 任務と製品契約

`k999ln/rock`の既存Skyを使い、Model・Agent・Toolの商品登録→検索/比較→Add→接続先選択→認可→本人承認→一件のEve仕事→結果/使用量照合→更新/失効までを一つの契約へ結ぶ。最初の縦断は**審査済みの代表Tool一件**で、本人だけのsandbox入力と無料のPC内MCPを使い、同一owner/job/revision・商品版・接続先・承認digest・成果hashを照合する。次にProvider sandboxのOAuth経路を別受入する。ModelとAgentは共通商品表示・登録/版契約を整え、各runtimeの実推論/委任は個別証拠で受け入れる。全種類・全接続先の完成を一件の試験から宣言しない。

本人の2026-10-20要件と[Sky詳細契約](../sky-tools-complete-design.md#sky-marketplace-mcp-lifecycle)を正本にする。作者の同一性/配布元/license/依存関係、署名/hash、入出力schema/権限/料金/実行先、審査/sandbox/公開範囲/失効、PC・Sky Cloud・提供者MCP、initialize/能力交渉/tools/list/prepare/tools/call/結果照合、OAuthの期限/再接続/解除、権限・接続先変更時の再承認、失敗/部分成功/結果不明/取消、SDK/動くサンプル/診断、作者/利用者の記録を含む。商品価格、外部実費、Rock側料金を別に表示する。**Addは購入でも実行でもない。** 有料購入は明示条件を見た決済とProvider再照合、仕事実行は現在の利用権・scope・見積/上限・本人承認をBrokerが確認して初めて成立する。

[参照チャット「RockstarOSを再設計」](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)の2026-10-21明示説明では、外部サービス（Xは一例）に対してSkyはAPI/MCPの**受け皿**である。外部ProviderのAPI権限・提供機能・利用枠・実費はSkyの商品登録やAddだけで成立しない。提供されない能力をSky独自の結果で置き換えてProviderの実結果と表示しない。仕事窓口の現行名は**Eve（旧称Zema）**で、既存の保存/SDK識別子との互換性を保つ。

RQ22〜RQ24のSky内MCP、三つの接続先、RQ01〜RQ49の既存契約を保持する。RockstarOSが本人性・権限・予算・保存/復旧を持ち、Skyが能力を接続し、Eveが依頼/承認/進捗/停止/成果を示す。署名は作者の同一性であり安全性保証ではない。第三者ToolにOS platform鍵を流用せず、任意shell/rootを共通APIにしない。remote MCPの自己申告料金を検証済み見積へ昇格せず、現行の料金付き直接実行拒否を緩めない。

## 実行前の正本・Git・証拠

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/02-sky-mcp.md`、`docs/prompt-playbook.md`、`docs/design-implementation-alignment-20260909.md`、`docs/execution-approval-20260909.md`、`data/execution-approval.json`、`data/project-status.json.phaseGates`を読む。製品階層は`docs/rockstaros-design-portal.md`、OS全体は`docs/rockstaros-complete-design.md`、Toolは`docs/sky-tools-complete-design.md`を正本とする。実装承認を再要求しない。
2. `git status --short --branch`で共有checkoutの未保存差分を保全する。着手時のGitHub main、実在する作業branch、open/関連merged PR、各**同一SHA**のCIを`npm run prompt:context`または同等のGitHub読取りで再取得する。ネットワーク/DNS失敗を最新確認とせず、refを40桁SHAで固定する。必要なら分離checkoutを使い、共有差分をreset・上書きしない。mainの引継ぎ入口/優先順位が作業branchへ未反映なら、その同期を最初に行い、選択的なsource移植と証拠を残す。
3. `lib/sky-tool-package.ts`、`lib/sky-tool-package-store.ts`、`lib/sky-tool-review.ts`、`lib/sky-submission.ts`、`components/sky-marketplace.tsx`、`components/sky-mcp-center.tsx`、`lib/mcp-hub.ts`、`lib/mcp-client.ts`、`toolkits/sky-mcp-connector/server.mjs`、`lib/sky-commerce.ts`、`lib/sky-commerce-store.ts`、`toolkits/sky-tool-sdk/src/index.mjs`、`toolkits/sky-tool-sdk/examples/minimal.mjs`、`lib/workflow.ts`と対応API、migration、試験を直接読む。対象SHAとdirty treeを区別し、mainにある機能を古いbranchの欠落から新規開発しない。

**作成時の読戻し**: GitHub main `01b6aecd8b4d8bd2385665232dfb4b57029f991f`の同一SHAに`verify`と5つのsecurity/repair checkが成功。実在する`codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`は同一SHAの`source-preparation`一件だけ成功で、全体CI合格ではない。作成時のローカルHEADも後者だが未コミット差分が約547 pathある。`npm run prompt:context`はGitHub文脈取得に失敗（exit 2）、GitHub connectorでmain/branch/PR/CIを確認した。直接`git ls-remote`はDNS解決失敗のためfetchできていない。実行者はfetch可能になってから入口を同期する。対象branchのopen PRはない。open PR #130はmain catchup、#147（Sky Visual Scribe）、#167（Pixel Model/Agent）、#169（Pixel Agent Tool chain）、#160（Sky月次Sandbox）はmainへmerged済みであり、各機能の対象範囲を読んで再利用する。作成後にrefやCIが変われば新しい同一SHA証拠を優先する。

## 差分、原因、修正順と合格証拠

| ID | 対象と現在の根拠 | ROCKの修正順 | 合格証拠・残る条件 |
| --- | --- | --- | --- |
| SKY-M01 商品一周 | `SkyToolPackage`は作者/配布元/licenseと入出力/権限/実行先を持つが、依存関係やModel/Agentを含む共通比較・削除/更新の意味は一周で未受入。 | 既存Package/Registryを版互換で拡張し、依存の固定版/hash、作者identity証拠、追加/更新/削除状態と差分表示を結ぶ。既存商品ID・購入権・仕事receiptを保持する。 | 正常登録/検索/比較/Add/更新/解除、license不明/依存欠落/hash不一致/旧版/別owner拒否。署名のみで公開・安全を宣言しない。Model/Agentの実runtimeは別gate。 |
| SKY-M02 接続/認可 | `sky-mcp-center.tsx`はPC以外を準備中と表示。ConnectorはPCでinitialize/list/Passport/prepare/executeを持ち、remote OAuth browser flowは未接続、401/403で停止する。 | PC縦断を先に固定。接続先・capability・Tool一覧digest・schema・scope・期限をPassportに保存し、差分で承認を失効させる。Provider OAuthはissuer metadata、PKCE、resource/scope、期限/refresh/解除を別adapterでsandbox接続。Sky Cloudは管理先の本人/隔離/費用境界を満たしてから有効化する。 | PCで接続→単回承認→成果読戻し→失効。Provider sandboxで許可/拒否/期限切れ/scope拡大/解除/再接続を同一account・serverで検証。Cloud/ProviderのUIをfixtureだけで「利用可能」にしない。 |
| SKY-M03 Add・購入・実行 | 既存Commerceは買い切りJPYとStripe状態を扱う。Sky追加、SIM/eSIM利用権、Checkout、Eve実行の境界が複数経路にある。 | server側でAdd記録、商品購入権、scope/予算付き実行資格を別々に照合し、Eveの同一owner/job/revisionへ結ぶ。現在の買い切り契約と月額16 USD枠付きサービス・Cloud usage・外部実費を混ぜない。 | 有料商品Add後の注文0/外部呼出0、Checkout取消/遅延通知/返金/価格改定/失効で無権実行0、承認済み単回のみ実行。実Stripe sandbox・本番収納は別証拠。 |
| SKY-M04 結果・使用量・復旧 | Connectorは`outcome_unknown`を持つが、Provider別の部分成功/取消照合と作者/利用者の共通成果記録は未受入。 | attemptとreceiptに商品版、Provider reference、入力/成果hash、itemized usage、停止/取消要求と照合結果を結ぶ。作者には本人内容を漏らさない集計のみ返し、利用者には元成果をowner別に表示/持出し可能にする。 | 成功/失敗/部分成功/結果不明/取消を別表示。送信後timeoutは盲目的再送0、結果照合後の二重課金0、別owner参照0、停止後の新規作用0。Providerに照会APIがなければ結果不明を保持する。 |
| SKY-M05 作者体験と価格 | SDKのminimal sampleはある。商品価格/外部実費/Rock料金の三分割と依存/接続診断を一件の導入時間で未検証。 | 動くsampleを現SDK/審査sandboxに結び、診断で版・依存・hash・scope・接続・料金不足を特定する。MarketとEveで料金三分割、事前単価/見積/上限、実行中の予約と明細を同じ版で表示する。 | 新規作者の導入成功率・所要時間・失敗復旧時間、利用者のAdd→承認→成果確認までの操作数を実測。未確定額では有料実行を閉じる。 |

## 実装順・責任・検証

1. **基底同期と契約試験**: SKY-M01/03の現状試験を走らせ、main/branch/local sourceの採用差分を記録。既存DB migration・公開Registry・Tool ID・SDK互換、購入権、owner別仕事を壊さない受入fixtureを先に追加する。
2. **代表Toolの縦断**: 審査済み無料PC内Tool一件で、登録→検索/比較→Add→Passport→本人の一回承認→Eve job→成果/usage→更新/失効を実装し、同一版でUIとAPI/DBを読戻す。AddだけでToolを呼ばない。入力/出力schema不一致、別owner、古いrevisionを拒否する。
3. **Provider境界**: 実OAuthが必要な提供者MCP一件をsandboxで選び、認可・期限・scope変更・解除・再接続を検証。料金付きremote MCPは署名見積・予算予約・最終receiptの契約が成立するまで直接実行を閉じる。Sky Cloudは対応する隔離/予算/失効の実行adapterが受入されるまで準備中と表示する。
4. **異常・作者導入**: 部分成功/結果不明/取消/失効とSDK sample/診断、商品価格/外部実費/Rock料金の表示を完成させる。作者と利用者の閲覧権限を分け、成果原文を作者集計へ送らない。
5. **証拠・引継ぎ**: 変更箇所の試験を先に実行し、`node --experimental-strip-types --test tests/sky-marketplace.test.mjs tests/sky-tool-package.test.mjs tests/sky-commerce.test.mjs tests/mcp-connector.test.mjs tests/mcp-client.test.mjs tests/sky-tool-sdk.test.mjs`、必要なAPI/DB試験、実Sky UI、`npm run typecheck`、`npm run design:check`、`npm run baseline:check`、`npm run project:update`、`npm run project:check`、`npm run verify`を記録する。localhost制限、既存の失敗、Provider未接続は合格に換算しない。新しいOS component/Sky catalog Toolの変更は`data/design-document-index.json`とOS/Tool詳細を同じ変更で更新する。利用方法を変えたらREADME本文も同期する。

ROCKはcatalog、本人/権限/予算、状態、receipt、復旧を担う。EXTERNALはMCP server、OAuth issuer、商品ロジック/価格/licenseを提供する。JOINTは同一版のProvider sandbox E2Eを受け入れる。OWNERはscope、購入、外部作用、公開範囲を決める。原稿/秘密値をGitへ入れず、OS image・大量logはGit外へ置く。一般公開、実課金、実資金、実機導入は各gateの条件が揃った対象だけで行い、設計依頼を実施済みとしない。

終了時はSKY-M01〜05ごとに原因、変更path、修正/未修正、試験コマンドと結果、host/fixture/Provider sandbox/実機/本番の段階、未解決条件、次の一手を`project.md`と`data/project-status.json`へ記す。文書保存、作業branch反映、main統合、配備を別々に報告する。RQ01〜RQ49の保持と、RQ12のQEMU受入、RQ13のゲーム交換、RQ14の作者SDK、RQ15のATM自社手数料0を自己点検し、このSky縦断へ勝手に合格を転用しない。
