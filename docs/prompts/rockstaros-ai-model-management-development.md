# RockstarOS AI・モデル管理 開発プロンプト

作成: 2026-10-21（America/New_York）。主担当: Android / Device / Local AI、ROCK。対象: RQ48のモデル管理具体化、AI02・AI05・OS09・SKY21。実装承認済みの範囲で進め、実機導入・外部送信・有料処理は既存の個別gateと本人同意を守る。

## このプロンプトの入力と最新確認

RockstarOSを共通runtimeとし、Skyが能力とmodelを追加・比較し、Eveが依頼・承認・成果を扱い、Brokerが本人・権限・費用・停止を判定する。モデルは非信頼の文章またはplan候補を返す。今回の目的は、利用者が指定した **出所/版/license/容量/hash → 適合 → 取得/再開/照合/回収 → 実測比較 → 実行先選択 → 権限付き資料 → Broker再検査 → 更新/削除後の履歴** を、一件の仕事で安全に使える実装と証拠へ進めること。設計正本は `docs/ai-native-os-architecture.md#ai-model-management`、現在地は `docs/llm-evaluation-architecture.md` と `data/llm-capabilities.json`。

- GitHub `k999ln/rock` main: `01b6aecd8b4d8bd2385665232dfb4b57029f991f`。同一SHAのGitHub check-runsは `verify`、SPIDERのPython/JavaScript CodeQL、secrets、repair regressions、production web security measurementの6件がすべてsuccess。これはmainのCIであり、未commitの作業木の合格ではない。
- 実在する旧作業branch `codex/esim-cloud-access`: `951d82d5a491a284aed4e0d4d280171d835d4b43`。同一SHAには `source-preparation` success 1件のみ。mainより652 commit遅れ、merge baseは `9f64aee3de9cc74e6b6e7eae34052780e000c296`。現在の共有checkoutは大量の未commit差分を持つ。これをreset、checkout切替、上書きmergeしない。
- 関連PR #152（署名モデル導入）、#155（同意済み無料Cloud選択）、#158（Pixelの公開モデル検索/適合導入）、#159（月次Sandbox料金接続）、#167（公開モデル/AgentのPixel追加）、#169（許可済みTool chain）はすべてmerged。#181もmain `01b6aecd…` へmerged。各PRの成功を現作業branchの成功へ転用しない。
- `npm run prompt:context` はこの環境の`gh`取得に失敗した。GitHub connectorのcompare refs、PR metadata、check-runs APIで上記を読み直した。着手時にもmain・対象branch・PR・同一SHAのCIを再取得し、ref変更時はこの固定SHAを更新する。
- 2026-09-09監査に固定された歴史的入力はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native head `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design head `de5b102d3525daccf604efd5685bdf8c14ad5d50`。baseline検査との対応のため保持するが、現在の実装起点/CIとして使用しない。
- 旧作業branchの製品baselineはv1.120/RQ01〜49、mainはv2.08/RQ01〜50で、mainにはアカウント単独利用、同意済み無料Cloud、月額Sandboxの後続方針がある。まず明示指示の時系列と差分を照合し、RQ01〜49を失わずmainのRQ50/単独利用も消さない。月額16 USDの古いLinux案をmainの料金へ無断で上書きせず、Cloud無料とSandbox請求、本番課金を分ける。

## 先に読む実装と証拠

1. 対象checkoutの`AGENTS.md`、正本5ファイル、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/07-android-device-local-ai.md`、`docs/ai-native-os-architecture.md`、`docs/llm-evaluation-architecture.md`、`docs/sky-tools-complete-design.md`、`docs/design-implementation-alignment-20260909.md`、`data/project-status.json`の`phaseGates`、実行承認2ファイル。Android変更時は`docs/os-prototype.md`、`docs/native-os-integration.md`、`docs/native-os-validation.md`も読む。
2. mainの`android/core/src/main/java/dev/rock/core/platform/ModelProfileManifest.java`、`ResumableModelArtifactStager.java`、`TrustedModelArtifactPipeline.java`、`PlatformStore.java`、Androidの`LocalModelCatalog`、`LocalModelInstaller`、`PublicModelDiscovery`、`ModelSelectionPolicy`、`ModelProfileActivationCoordinator`、`SkyAddonStore`、`SkyAgentExecution`と対応テストを読む。署名、hash、job pin、private staging、互換性、取消を再実装せず拡張する。
3. mainの`lib/sky-model-routing.ts`、`lib/sky-model-selection.ts`、`lib/llm-providers.ts`、`lib/sky-free-cloud.ts`、`lib/workflow.ts`と対応テストを読む。現在の`chooseSkyModel`はコード作業か一般対話かの文字列heuristicで、同条件の品質/熱/費用benchmarkではない。loopback discoveryはread-only。古いbranchの`lib/sky-model-selector.ts`や`lib/sky-linux-models.ts`をmainにあるものと仮定しない。
4. `docs/evidence/pixel-open-addons.json`、`docs/evidence/pixel-discovered-models.json`、`docs/evidence/pixel-agent-tools.json`、無料Cloudと月次Sandboxの同一artifact証拠を読み、host/fixture、Pixelの試験署名APK、本人用Linux、provider sandbox、本番を分ける。Pixelの公開GGUF追加と有限仕事、無料Cloudの同意済み実応答は限定受入。全OS image、任意形式/任意model、全用途の品質、production請求の合格ではない。

## 修正順と合格条件

| 問題 | 原因と対象 | 実装順・責任 | 合格証拠 / 未解決条件 |
| --- | --- | --- | --- |
| AM01 入口の不一致 | dirtyな旧branchに最新mainのモデル/Cloud/Pixel実装がない。文書だけのAI管理追記はmain未統合 | ROCK。まず分離した最新main checkoutで同一SHAのsource/CIを読み、旧branchのRQ48追加と現行baselineを差分で移す。AGENTS/README/project/status/設計/nextPromptの再開先を一致させる | 旧仕事/契約/料金/新RQを保持したdiff、mainと実装branchのSHA、CI、文書保存/branch反映/main統合を別記録。共有dirty checkoutを破壊しない |
| AM02 登録・適合・取得 | manifest/stagerとPixel公開GGUF導入はあるが、任意形式/Linux/端末ごとの正確な適合、全artifact/licenseの処理、回収が一経路で未受入 | ROCKが既存manifest/catalogへ出所、固定revision、weights/tokenizer/template hash・byte数、license参照、format/ABI/runtime/API、端末能力・容量を結合。EXTERNALのlicenseとruntime条件は申告とRock確認を区別。Broker-private stagingでRange/ETag/全hash、容量reserve、旧pin参照を検査 | 中断→同一object再開、source変更/不正Range/hash/容量不足/失効の拒否、不要な部分fileのみ回収、旧model/本人export/旧仕事保持。host fixture、同一Pixel APK、本人用Linuxを別証拠にする。production信頼鍵・配布権は未確認なら閉じる |
| AM03 実測・仕事別比較 | Skyの現行heuristicとPixelの限定選択を「最良モデル」と呼べない | ROCK/JOINT。同じ入力suite、context、上限、端末/OS/runtime、電源/室温で二modelのRAM/PSS、load、TTFT、token/s、p50/p95、熱/電池、schema率、品質/失敗分類を測る。Sky/Eveに測定条件、除外理由、選定理由、未測定を示す | 数値と原artifact hash/計測時刻を含む比較receipt。同じsuiteの回帰で劣化を示す。合成点数だけで実業務品質やMini/Pro適合を宣言しない |
| AM04 実行先・費用・資料 | local端末、本人用Linux、同意済み無料Cloudの既存経路が別。検索資料と生成文の根拠を同一仕事へ固定できていない | ROCK。job/revisionにprofile ID/版/hash、実行先、送信内容/provider、資料read scope、見積/承認上限を固定。外部送信なしの仕事はCloud候補を拒否。資料はgrantを毎回確認し、chunk/検索結果にsource ID/hash/取得時刻/引用範囲を付け、生成文と別保存。既存Cloudの同意・usage・請求gateを再利用 | local-only時Cloud HTTP呼出し0、失効資料/別owner資料/権限撤回拒否、実行先変更で新revisionと本人承認、費用超過拒否。無料Cloudの実使用量とSandbox請求、本番請求は別々に照合 |
| AM05 非信頼plan・上限・復旧 | 資料/Tool結果が偽命令を含み得る。model更新/削除後も旧jobを読める必要がある | ROCK。入力の種類と出所を型で分離し、外部文書の命令をdataとして隔離。形式、文字/token、時間、step、Tool回数をjob/adapterで制限。各操作の直前にBrokerがowner、grant、Tool/入力、effect、budget、停止世代、端末能力を再検査。canonical job/成果/引用/profile identityはweightsと独立保存 | prompt injection、Tool結果偽system、過長入力、停止後結果、他owner、古いgrant、二重結果を拒否。model更新/削除/再起動/backup後も旧jobと成果・出所を読める。旧modelでの再生成不可と履歴閲覧可能を区別 |

## 実行と検証の順番

1. AM01のmain引継ぎを完了して、既存実装と不足だけを小さな変更単位に分ける。製品名やAI/SI表記、料金/契約、Sky単独利用、Pixel試験署名APKとfull OSの境界を保持する。初回の対象はPixel 10 GL066/frankelと本人用Linux。Mini/Proは適合情報を別収集する。
2. AM02を既存Android Core/Pixel catalogの境界から実装し、限定GGUFの中断再開/失敗/安全回収と旧job pinを受け入れる。`vendor/mr`原本、`IMPORT-MANIFEST.json`、秘密鍵/原稿を変更しない。第三者modelをOS platform鍵で署名しない。
3. AM03の測定器と比較receiptを追加し、まず同じ端末の二modelで基準を固定する。`chooseSkyModel`のheuristicを無根拠の実測表示へ変えず、未測定なら理由付きの手動選択/停止にする。品質suiteには通常/曖昧/注入/長文/Tool置換を含める。
4. AM04–05を代表的な非金融仕事一件へ接続する。`lib/workflow.ts`、owner別保存、revision CAS、Broker/Agent Tool境界を通し、実行先変更/資料取得/各step/取消/結果不明を観測する。遠隔Providerや費用条件が未確定ならfixtureまで進めて外部実行を閉じる。
5. 変更箇所のfocused testsを先に実施。少なくともAndroid Core/automation/Pixel Shell unitとinstrumentation、Sky model routing/free Cloud/workflow、Linux download・実測・停止を対象にする。`npm run baseline:check`、`npm run design:check`、`npm run llm:architecture:check`、`npm run project:check`、`npm run verify`を同じ候補で通す。Android変更は`docs/os-prototype.md`に従ってSDK/APK/端末を分け、full OS変更なら対象Linux検証も行う。対象外の既存gateが失敗したら原因と再現を保存し、成功へ換算しない。
6. `docs/templates/os-acceptance-report.md`と進捗JSONへsource SHA、artifact hash、測定条件、host/fixture/Pixel/Linux/Cloudの段階、実測値/失敗、未解決を記録。`npm run project:update`でREADME/projectを同期。一般公開、Pixel full OS、MetaMask実資金、production Cloud請求はそれぞれ既存gate合格前に有効化しない。

## 完了判定と次の再開点

「モデルを追加できる画面」やmanifestの保存だけでは合格にしない。**一つの固定model artifactが登録→適合→中断再開/照合→同条件比較→本人の仕事で選択→Broker検査→資料/生成結果の出所付き成果→モデル更新/削除後の旧仕事読戻し**まで通り、拒否系も再現できることを今回の実装合格とする。Pixel、本人用Linux、Cloudは同じ業務契約を使いながら受入状態を別記録する。未完了なら最後に、次の操作、対象path、再現コマンド、期待/実際、同一artifact証拠、残る外部条件を残す。

RQ01〜RQ49の権限、Wallet、Game、ATM手数料0、作者SDK、サービス利用権、公開保留を壊さない。mainの後続RQ50とSky単独/アカウント入口の明示決定も差分監査で保持する。商品料金、通信料、AI利用料、外部実費、OSS/BYOKを混同しない。
