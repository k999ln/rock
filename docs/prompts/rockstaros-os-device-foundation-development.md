# RockstarOS OS・端末基盤の開発実行プロンプト

作成日: 2026-10-21（America/New_York）。主担当は **Android / Device / Local AI**、`OS02`・`OS03`・`OS04`・`OS10`・`OS11`・`RLS02` / `ROCK`。`DSP01`の機種別契約を使い、`V01`・`RLS01`のQEMU Developer Previewは独立系列として保持する。対象はRockstarOS 1.0 / `dev.rock` のCoreであり、Sky・Eve・管理Linuxの仕事を安全に動かす端末基盤を作る。RQ01〜RQ49、特にRQ12・RQ26・RQ27・RQ29・RQ42・RQ48を維持する。**この文書の保存は実装・実機合格ではない。**

## 0. 着手時に現在地を固定する

`AGENTS.md`、正本5ファイル、`docs/workstreams/README.md`、責任分界、Android workstream、Native/QEMU workstream、`docs/prompt-playbook.md`、実装承認、`docs/design-implementation-alignment-20260909.md`、`data/project-status.json#phaseGates`を読む。さらに[設計入口](../rockstaros-design-portal.md)、[OS詳細](../rockstaros-complete-design.md)、[機種別契約](../device-support-architecture.md)、[Pixel計画](../phone-preview-20260911.md)、[native統合](../native-os-integration.md)、[native検証](../native-os-validation.md)、[Android試作](../os-prototype.md)、[導入gate](../release-installation-plan-20260909.md)を確認する。すべての対象実装と試験は、使うcheckoutのSHAで読み直す。

2026-10-21にGitHub connectorで読んだmainは `01b6aecd8b4d8bd2385665232dfb4b57029f991f`。同一SHAの `Rock star verification` と `SPIDER repair regressions`、`SPIDER repository security`、`SPIDER CodeQL security` は成功。実在する作業branch `codex/esim-cloud-access` は `951d82d5a491a284aed4e0d4d280171d835d4b43`で、同一SHAの成功は **Phone source preparation (not OS boot)** のみ。`npm run prompt:context` はexit 2で最新文脈を確定できなかったため、これらは同等のGitHub読取り結果である。PR #7のPixel source準備はmerge済み。PR #105の二重保存・復旧競合、PR #130のmain catchupはopenで、main反映済みと扱わない。着手直前にmain、実在branch、関連PR、同一SHAのCIを再取得し、取得失敗は未確認と記録する。

製品baselineの2026-09-09監査に記録されたmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native head `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design head `de5b102d3525daccf604efd5685bdf8c14ad5d50` は**履歴上の起点**で、2026-10-21現在のheadやCIではない。

現在のcheckoutは `codex/esim-cloud-access` / `951d82d5a491a284aed4e0d4d280171d835d4b43` の上に多数の未commit変更がある。**最初にmainとbranchの差、dirty変更、引継ぎ入口と優先順位を保全・同期する。** 他作業の変更をreset、checkout、強制上書きしない。必要なら分離checkoutを使い、source SHA・採用元・未統合部分を記録する。

現状はPixel 10 / GL066 / `frankel`が読取り専用で確定し、試験署名APKの非破壊実再起動を含む23/23が合格。Local AIの限定実機試験もある。一方、Pixel用RockstarOSの**全image build、正式署名、flash、同一image起動、SELinux enforcing、OTA rollback、data/Keystore全損復元は未受入**。`data/device-support-matrix.json`の`flashReady=false`を維持する。eSIMからSky・Eve利用開始するmoduleは既定無効で、OS受入後の別工程。QEMU旧候補のD0〜D6、Android単体APK、Web、Mini、Proの証拠を相互転用しない。

### 再設計チャットを反映する実装契約

参照したチャットは「RockstarOSを再設計」（`codex://threads/01a14d54-daee-7c30-87a8-faea84641a40`）。本人の後続指示により、**Home全体が投稿を入口とするSkyストリーム**で、ニュース・モデル・Agent・任意のWallet/Market・コミュニティーOSを投稿から発見、追加、設定できる。Eveは同じowner/jobの依頼・進捗・停止・成果の窓口である。Skyは外部API/MCPの**受け皿**であり、X専用API契約を利用者ごとの必須導入条件にしない。X本人の実投稿、X自身のFor You、継続同期は接続先の実データ受入が残っており、MCPのfixtureやX画面viewerを成功証拠にしない。Homeのアイボリー・深緑・ブロンズ配色と「Sky」入口はWeb側の設計で、端末CoreがXの色・API・推薦算法を持つ理由にはならない。

コミュニティーOSはルール・デザイン・LLM・Agentの**版付き構成**を鍵で参加し、本人の環境へ追加/適用/戻せるWeb Previewがある。これを新しいOS binary、機種互換、platform署名、実機の鍵保管へ昇格させない。Eveの会話履歴は本人別保存のWeb実装とCodexチャットのローカル履歴を区別し、端末喪失後の復旧と実二端末引継ぎを別に受け入れる。[87件の差分台帳](../../data/rockstaros-research-reconciliation.json)と[実装順](../rockstaros-research-integration.md)を読み、RQ01〜RQ49と追加38件のうちCoreに関わる差をこの15項目へ対応付ける。旧Buildroot/QEMUは現再設計の選択再利用元であり、現行Pixel版の完成証拠ではない。

**最初の利用者体験を同一jobで固定する。** 対応機種だけにSky投稿/コミュニティーOS構成を表示し、本人が機能を追加、Eveで仕事を作り、BrokerがアプリUID/署名/権限・owner・費用上限を実行直前に再検査し、受入済みLinuxまたは明示承認したCloudへ渡し、進捗・使用量・成果を保存し、停止/再起動/復旧後に照合する。投稿のAddを購入・Tool実行・OS導入・Android権限承認と混同しない。端末にない能力は理由とclient/browserの代替を示し、Web上の機能Addをnative OS対応済みと表示しない。`lib/workflow.ts`と同じjob/revision/operation IDのfixtureでWeb・Android・QEMUの状態を照合し、Pixel実測とMini/Proの受入は別記録にする。

この縦断では次の三つの未完了差を先に検証する。A16は最終受信先まで一回性・結果照会・最大費・旧worker遮断を確認し、結果不明を新IDで自動再送しない。A9は端末・管理Linux・Cloud間の移行前にデータ移転許可、残仕事の総費用、熱/電池、旧worker失効を評価する。A13は成果の版、実証/未確認、宛先、費用、本人の次の判断を端末表示が変わっても維持する。三案は[研究照合](../rockstaros-research-integration.md)上の実装・比較待ちであり、このプロンプトへの記載を算法の完成や独自性の実証にしない。

## 1. 既存コードを読み、15項目を実装へ割り付ける

`android/automation/src/main/java/dev/rock/automation/DeviceCapabilitySnapshot.java`、`RockShellService.java`、Shell/Brokerのmanifest・AIDL、`contracts/device-capability-snapshot.json`、`data/device-support-matrix.json`、`scripts/inspect-phone.py`、`scripts/check-device-support.mjs`、`android/core/`のPackage/Platform/backup、`systems/rock-star-os/os/runner/`、`systems/rock-star-os/os/update/`、`systems/rock-star-os/os/desktop/backup.py`、`os/physical/`、`scripts/prepare-phone-build.py`、`scripts/freeze-phone-build-inputs.py`と対応試験を実際に読む。各項目を `要望 / main・branch SHA / source / 実装状態 / host・fixture・QEMU・emulator・Pixel・本番の証拠 / 次の差分`で記録する。既存のBroker、Wallet、仕事schema、SDKを再利用し、別の権限体系や任意shell APIを作らない。

| 順 | 要件と実装作業 | 最低限の合格証拠 |
| --- | --- | --- |
| 1 | 正確なメーカー・機種・地域SKU・OS release/API/build・機能を読取り、観測時刻と出所を付ける。OS報告値とhardware attestationを区別する。 | Pixel GL066のreadbackと、未知・偽装・期限切れを対応済みへ昇格しない試験。機種文字列だけでflash可としない。 |
| 2 | 署名済みDSPのexact SKU、boot/recovery、driver、更新、受入証拠が揃った機種だけnative導入案内を出す。その他は既存OS client/browserの可否を個別表示する。 | 非対応・不明・別SKUで導入導線が閉じ、Pixelも`flashReady=false`中は書込み案内を出さない。 |
| 3 | アプリ実体のUID、署名者、version/API、manifest/実付与permissionを導入時と実行直前に照合し、差分・失効を拒否する。 | 同名別署名、UID差替え、downgrade、権限増加、削除後再導入の否定試験。 |
| 4 | Android UID/SELinux、Linux user/namespace/cgroup、owner/job grantを結び、プロセス・アプリ・仕事を分離する。 | 別owner/job、guest root、停止済みgrantからの読取・書込・外部作用を拒否する実環境証拠。 |
| 5 | 対応端末だけにLinux環境を作成・起動・停止・再起動し、guest版・image hash・owner・jobを記録する。Android Terminal/AVFとRockstar管理Linuxを混同しない。 | 同一Pixelのguest lifecycle、失敗・強制停止・OS再起動後の状態照合。Mini/Proは各hardwareで別受入。 |
| 6 | CPU、RAM、disk、wall time、出力byte数の上限を実行前に固定し、OS側で強制する。resource観測だけを制限と呼ばない。 | 境界値/超過/並列実行時に停止し、部分成果・費用予約・再試行状態が安全に残る。 |
| 7 | 異常終了、端末再起動、VM停止、応答喪失からowner/job/revision/attemptを照合して復帰する。 | 同じ操作IDの再照会、重複作用拒否、結果不明の明示。外部作用を盲目的に再送しない。 |
| 8 | 本人別暗号化保存、AndroidKeyStore/backup鍵の階層、backup manifest/hash、復元後のtoken・承認失効を実装する。 | emulatorとPixelでexport/importを分け、原本byte/hash、別owner拒否、鍵不一致、旧版migrationを検証。 |
| 9 | 端末または鍵喪失時の空の復元先、本人復旧phrase、旧端末writer失効、新端末rebindを明示する。 | 非破壊exportと、管理されたdata/Keystore全損復元を別記録。破壊試験は既存4/4 flash gateの条件を満たした後に限定。 |
| 10 | OS/APK/Toolの署名更新、互換検査、trial health、失敗rollback、data migrationを別々に扱う。 | 同一候補の更新失敗・起動不能・旧slot復帰と、旧data reader互換を検証。失効済み版へ戻さない。 |
| 11 | 電池、発熱、空き容量、省電力/suspendを監視し、実行可否、停止、成果保存、利用者表示へ反映する。 | 低電池/熱/容量不足/消灯で無断消去・無制限実行をせず、再開条件と測定値を残す。 |
| 12 | 通知、カメラ、マイク、ファイル選択は既存OSの権限・picker・foreground制約へ接続する。 | 拒否・一時許可・失効・背景化の実機試験。permissionを持つだけで本人の仕事承認にしない。 |
| 13 | Pixel、QEMU、Web、Mini、Proの受入表を分け、同じjob/成果contractと機種別adapterを照合する。 | source/artifact SHAと環境別結果を記録し、未実施を成功へ換算しない。 |
| 14 | native OS版は**同一image hash・同一Pixel**で起動、通信、保存、再起動、署名更新、失敗復旧を一周させる。 | `docs/templates/os-acceptance-report.md`のD0〜D6と機種別release gateに実測・失敗を記入。 |
| 15 | guest Linuxのroot権限をAndroid hostのUID/SELinux/Device Owner権限へ昇格させない。 | guest→hostの権限境界、port、file、Binder、別owner、任意shell拒否の否定試験。 |

## 2. 実行順と停止条件

1. **sourceと契約の同期。** mainの新しい実装と現branchのdirty差分を保全し、上表の未実装・既存実装・実証不足を分ける。最初の小さいhost試験を実行し、原因と修正順を決める。文書訂正をruntime修正として記録しない。
2. **Core境界。** 項目1〜4、6〜8、15の不足を既存Broker/Platform/runnerへ追加する。作者署名を安全性保証とせず、第三者Toolにplatform鍵やAndroid rootを渡さない。仕事の状態遷移は`lib/workflow.ts`との同一fixtureで照合する。
3. **Linuxと端末資源。** 項目5、7、11、12をPixelの既存OS clientで限定受入する。Terminalのguest rootとhost権限、VMの停止/再起動/保存を測る。Web、Mini、ProへPixelのAVF binaryや証拠を流用しない。
4. **全OS build入力。** 対象GL066、Google factory/full OTA実byteと掲載hash、vendor inventory、license、署名/rollback/backup計画を揃える。`fullBuildInputGatePassed=false`の間は実際のSoong build成功を記録しない。専用x86_64 Linuxの有料環境は予算/アカウント条件を確認してから作成し、source・toolchain・出力hashを固定する。
5. **初回flashと同一image受入。** `data/android-first-flash-gate.json`の4/4、正確なPixel現状態、復旧物、本人の端末操作条件が揃うまでunlock/flashしない。合格後に項目9・10・14を同じimage/Pixelで実測する。QEMU Developer Previewは別の同一archiveで再受入し、Pixelの代替証拠にしない。
6. **サービス接続。** OS Coreのgateを通した後で、既定無効のPixel eSIM/契約moduleを同じbuildへ組み込み、真正なeSIM install、契約・支払いsandbox、管理Linux、Sky/Eve利用・停止・失効/復帰を別の一周で検証する。料金、通信、AI usage、外部実費を分け、一般公開/実課金は別gateにする。

ROCKは共通Core、Broker、DSP契約、端末UIと検査/復旧手順を持つ。EXTERNALはAOSP/GrapheneOS・OEM BSP/firmware・carrier/eSIM・Cloud/決済を供給する。JOINTは同じ実端末・Provider sandboxでの一周を受け入れる。OWNERは端末操作、鍵の保管、契約/予算、復旧phraseと公開判断を行う。対象・機種適合・取引条件が未確定のまま条件付き了承を実行済みにしない。

## 3. 検証、証拠、引継ぎ

変更箇所の小さい試験を先に実行する。文書/契約は`npm run device-support:check`、`npm run android:architecture:check`、`npm run android:first-flash:check`、`npm run design:check`。Android変更は`docs/os-prototype.md`のSQLite/SDK/APK/端末試験、native変更は対象branchのLinux/QEMU試験に従う。統合前に`npm run project:update`と`npm run verify`（baseline:checkを含む）を実行する。失敗・未実行はそのまま記録し、別SHAのCI成功や合成fixtureを現候補の実機合格へ転用しない。

各項目に `source SHA / artifact hash / 環境 / command / 期待結果 / 実結果 / 未解決条件`を記録し、同一imageのOS受入は[OS受入報告template](../templates/os-acceptance-report.md)へ保存する。Gitには実装・設定・小さいfixture・要約証拠・復旧手順だけを置き、image、build cache、長いlog、秘密値、端末serialはGit外へ置く。`project.md`、`data/project-status.json`、利用方法が変わる場合のREADMEを同じ変更で同期する。OS component変更時は`data/design-document-index.json`と[OS詳細](../rockstaros-complete-design.md)を更新する。

完了報告では、文書保存、作業branch反映、GitHub保存、main統合、配布/公開を別々に示す。未達項目は次担当が同じSHA・対象path・再現commandから再開できるよう残す。最後にRQ01〜RQ49、単一owner多端末と複数playerの区別、同一契約複数端末の基本料重複防止、Cloud費用上限、Wallet/ゲーム実資金の別gateを自己点検する。
