# RockstarOS 端末別adapter・受入の開発実行プロンプト

作成日: 2026-10-21（America/New_York）。主担当: Android / Device / Local AI、`OS10`・`DSP01` / ROCK。対象は[共通端末適応](../device-support-architecture.md#current-device-adaptation)と[端末別受入](../device-support-architecture.md#device-specific-acceptance)。これは実装・検証を進める指示書であり、この文書の保存をadapter実装や実機合格へ換算しない。RockstarOS Coreのowner/job/revision/権限/予算/成果/保存を共有し、Skyは能力接続、Eveは依頼・進捗・停止・成果の窓口とする。RQ01〜RQ49、SIM/eSIMから既存OS clientへ接続する標準提供、Pixel native系列、QEMU Developer Preview、同一契約での基本料非重複を保持する。

共通OS・端末基盤の15項目とfull imageのgateは[OS・端末基盤の開発プロンプト](rockstaros-os-device-foundation-development.md)を先行正本とする。本書はそこへ今回の六つの端末区分を接続する実装範囲であり、同じ基盤を作り直さない。

2026-10-21の共有チャットとの境界: Skyは外部サービスのAPI/MCPを受ける接続基盤であり、Homeは受け取った投稿などを表示する面でもある。端末adapterは機種ごとの実在能力と権限だけを宣言・検証し、外部配信元のOAuth、投稿取得、推薦結果を端末能力として偽装しない。X本人の投稿取得はSkyの別workstreamで、[X接続の設計](../sky-tools-complete-design.md)と接続先・実データのgateに従う。現在のローカルsource/fixtureは実X API受入や「おすすめ」取得の証拠ではない。

## 0. 最新sourceと作業入口を固定する

正本5ファイル、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、本workstream、`docs/prompt-playbook.md`、実装承認、`data/project-status.json`のphaseGates、対象コードと証拠を先に読む。GitHubのmain・全関連branch・PR・**同一SHA**のCIを作業開始時に再取得する。作成時の読戻しはmain `01b6aecd8b4d8bd2385665232dfb4b57029f991f`（`verify`と5件のsecurity/repair checkが同一SHAで成功）、実在する`codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`（`source-preparation`だけ成功）である。`npm run prompt:context`はexit 2で取得不能だったため、GitHub APIの同等読取りと`git fetch`で確認した。open PR #130はmain未統合。Pixel関連PR #140・#151・#158・#167・#169はmergedだが、個々の旧証拠を現在のOS imageへ転用しない。次回取得失敗なら「最新確認未了」と書く。

このcheckoutはmainから**652 commit遅れ、3 commit先行**し、端末別設計を含む大量の未commit差分がある。mainのベースと引継ぎ入口/優先順位を最初に同期する。現在の作業木をreset・強制上書きせず、必要ならmain起点の分離worktreeで、対象差分をpath単位で選択移植する。mainの`android/`や`lib/`にある機能を古いbranchだけを見て未実装と判定しない。文書保存、作業branch commit、GitHubへの保存、main統合、実機受入、公開を別々に記録する。

2026-09-09監査の歴史的起点はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native head `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design head `de5b102d3525daccf604efd5685bdf8c14ad5d50`。これらはbaseline照合用であり、現在のhead/CIではない。

## 1. 既存実装と差を確定する

`docs/device-support-architecture.md`、`data/rockstaros-device-adaptation.json`、`data/device-support-matrix.json`、`contracts/compute-device-capabilities.json`、`contracts/device-capability-snapshot.json`、`lib/rockstar-device-link.ts`、`lib/workflow.ts`、Pixelの`android/shell/`・Broker/Local AI、`toolkits/sky-linux-local/`、Mini/Pro/相棒の各設計・試験を、main/作業branchの**実際のbyteと版**で読む。`tests/device-adaptation-branding.test.mjs`、`tests/device-lifecycle.test.mjs`、`tests/sky-linux-local.test.mjs`とAndroidの該当unit/instrumentationも確認する。能力ごとに`要望/RQ/task・main SHA/branch SHA・source・実装状態・host/fixture/実機/本番証拠・不足`を記録する。

現時点でPixel GL066/frankelの既存OS上の試験署名APKは非破壊再起動23/23、別の限定Pixel Linux文章処理にも証拠がある。しかしfull OS build/正式署名/flash/OTA/純正復旧、Keystore全損からの復元、Mini/Pro/相棒の統合実機は別gateである。`data/device-support-matrix.json`のPixel `flashReady:false`、初回flash gate 0/4を勝手に昇格させない。現在の端末別契約は文書・fixtureの段階で、端末能力の実測台帳ではない。

## 2. 原因から順に実装する

| ID | 現在の差と原因 | ROCKが進める実装 | 合格証拠と未解決条件 |
| --- | --- | --- | --- |
| DEV01 共通能力 | 四端末profileと追加の既存OS/汎用adapter契約はあるが、静的宣言だけでは実権限・鮮度・安全を証明できない | 既存capability schemaとdevice-linkを再利用し、機種/firmware/adapter版、観測時刻・期限、権限とgrant、入出力/compute/電源の`true/false/unknown`を交差検査。不存在/期限切れ/失効は拒否し、job/revision/費用上限に結合。新しい独立owner台帳を作らない | 改ざん、古いsnapshot、別owner、別端末、失効、権限拒否、二端末同時予算で誤実行0。schema追加だけを対応済みとしない |
| DEV02 Pixel | APK/Shell、Terminal/Linux、local model、保存と熱・電池の証拠が別候補に散る | mainのShell/Broker/Local AIと既存Pixel Linux実装を同一job・同一buildで結ぶ。Android権限の許可/拒否/失効、model hash/license/配置、成果の本人別保存・停止/再開、熱/電池時の制限を実装・計測 | host→Android試験→所有Pixelの非破壊実測を分離。再起動読戻し、モデル/入力/成果byte、温度・電池・時間、停止理由を同一artifactへ固定。full OS受入は別 |
| DEV03 avocadoMini | 音声/sensor/本人/場所/着脱と空間表示の統合hardwareが未受入 | 音声・sensor・本人判定・場所/着脱のeventを型付きadapterで受け、grantを再評価。表示/録音/送信を場所変更・取り外し・権限失効で停止/縮小。合成fixtureで先に状態機械を試す | 同一筐体の光学漏えい、RF/無線適合、充電/電池/熱、空間表示精度はMAT15/物理gate。部品未確定ならadapterを`unavailable`に保ち、合成成功を実機成功にしない |
| DEV04 avocadoPro | AI専用PCの候補BOMと制作/Game目的はあるが、確定構成・driver/model・周辺機器の同一試験がない | 固定した実BOM/OS/driver/CPU/GPU/NPU/RAM/保存に対する観測adapter、model hash/license、制作/Game出力の型付きartifact、周辺機器の許可/抜去/復帰を共通jobへ接続 | 選定PCで推論・制作/Game出力・停止/再起動/成果復旧・熱/電力/騒音を実測。画像・候補仕様を適合証拠にしない |
| DEV05 相棒 | 保護者/子端末とSOS独立動作は設計済み、回路と実測は未完了 | 子/保護者のpairing・失効、学校mode、物理操作のevent、低電池/通信断状態を共通権限へ接続。SOS/現地警報の経路はCloud/LLM/課金gateから分離 | 本体回路で通信・AI・契約停止中の現地警報、低消費電力、誤操作を測る。遠隔通知/通報は通信到達を別受入。子の音声を購入/外部送信の承認にしない |
| DEV06 既存OS/その他機器 | iPhone/一般PCと時計/TV/ロボット等に一律のOS機能を仮定できない | 既存OS Web/clientの許可済みcamera/mic/file/通知だけを公開。時計/TV/ロボットは実機能力を申告する個別adapterを追加し、不存在/拒否時は理由表示。ロボットの物理動作は独立の安全停止gateに分離 | 対象OS/ブラウザ/機種/firmwareで同一job・別owner拒否・切断/復帰・失効を確認。eSIMだけでapp導入・OS権限・全機能対応を主張しない |

## 3. 実行順・責任・受入

最初の実装単位はDEV01＋DEV02の**Pixel一件の縦断**とする。既存mainの仕事/権限/保存/課金を使い、依頼→能力確認→本人承認→端末内Linuxまたは明示したCloud実行→成果/usage→停止/再起動読戻しを同じjobとartifactで通す。次にDEV06の既存OS clientの最小接続と能力欠如の負例を作る。DEV03/04/05はfixture/adapter実装を物理部品待ちにせず進め、実機合格は各hardware・安全gateで別に記録する。Gameの非金融制作をWallet完成待ちにせず、実交換/資金移動は既存個別gateを通す。

ROCKはschema、adapter、Broker強制、owner別保存/復旧と失効を担当する。EXTERNALはAndroid/iOS/PC OS、部品・model/driver、RF/光学/電池仕様とProviderを供給する。JOINTは同一機種・build・jobのE2Eと物理安全を検証する。OWNERは対象構成、本人/保護者/場所/外部送信/実費、端末書込み・契約条件を決める。未指定の閾値は実測と危険分析に基づき固定する。端末購入/初期化/bootloader解除/flash/鍵生成、有料Cloud契約、一般公開を設計指示から実行済みにしない。

まず変更箇所の意味のある試験を選び、`npm run device-support:check`、`npm run android:architecture:check`、`npm run baseline:check`、`npm run design:check`を実施する。候補は`node --test tests/device-adaptation-branding.test.mjs tests/device-lifecycle.test.mjs tests/sky-linux-local.test.mjs`、mainの該当Android unit/instrumentation、対象Linux検証。release候補ではOpenSSL 3等の既存環境条件を記録して`npm run verify`を完走する。実機試験は機種・OS/build、署名、model/adapter版、同一job、温度/電池、grant、成果hash、停止/復旧を`docs/templates/os-acceptance-report.md`へ環境別に残す。巨大log/imageはGit外に保管し、Gitには要約と再現手順だけを保存する。

成果としてコード・fixture・設計台帳/詳細・`data/design-document-index.json`（OS component/Sky Tool変更時）・`data/project-status.json`・`project.md`を同じ変更単位で更新し、`npm run project:update`でREADMEを同期する。利用方法を変えたらREADME本文も更新する。各DEVの原因、修正順、合格証拠、未解決条件、main/branch/PR/CI/配備/実機の別状態を報告する。最後にRQ01〜RQ49、月額16 USD枠付き契約と端末追加時の非重複、OS/client/native/QEMUの受入分離、相棒SOSの独立性、秘密/原稿のGit非投入を自己点検し、次の一手を具体的に残す。
