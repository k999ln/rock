# Rock star OS — P1 実装と検証手順

現行要望は [製品ベース](product-baseline.md)、現在の実装再開先は [進捗・再開条件](../project.md)。Android/AOSPとLinux nativeの実績を分けます。

対象範囲: 本書は既存の **Android/AOSP P1のみ**。2026-09-09追加のLinux native OSは [別の実装・検証記録](native-os-integration.md)を参照する。最初の物理対象はPixel 10 GL066／frankel。BlackBerry-firstは退役済みで、Linux/QEMU Developer Previewは独立した受入系列として保持する。

## 現行の再開入口（2026-10-11）

現行の段階と同SHAの証拠は[Android workstreamの表](workstreams/07-android-device-local-ai.md#現行の検証段階と再開条件2026-10-11)を優先する。既存JDK 17／SDK 35を使ったhostの実SQLite・AIDL／Java compileに加え、`19ef1020`の[Android API 35 CI](https://github.com/k999ln/rock/actions/runs/38153378733)が成功した。Core 116件、automation JVM 16件、SDK 7件、emulator instrumentationのautomation 43件合格／物理専用2件skip、Shell 6件、Operator 6件とAPK build／lintが対象で、RockstarOS imageの起動試験ではない。

後続`57f63413`の精算済み同ID照合はCore 121件＋automation JVM 16件のhost合格まで確認済み。これを含む候補`7f5ed361`の[Android CI](https://github.com/k999ln/rock/actions/runs/38155308883)も成功し、artifact XMLでCore 121、automation JVM 16、SDK 7、emulator automation 43合格／2物理skip、Shell 7、Operator 6を確認した。追加の精算Core 5ケースとShell表示1ケースが実行されている。[2026-09-16のPixel非破壊再起動23/23](evidence/android-pixel-10-prefull-physical-20260916.json)は当時の試験署名APKの証拠として保持し、今回の変更や全OSの受入へ加算しない。全OS build／正式署名／flash・boot／OTA・rollback／data・Keystore喪失復元は未受入。

以下のP1設計、2026-09-05の到達点と試験記録は履歴を含む。再開作業は末尾の現行手順を使い、過去の「未実施」や件数を現状の集計へ流用しない。

2026-09-05。状態: OS部品を組み始めた試作。**OSイメージのビルド/起動、Pixel実機、第三者Storeは未検証。** [基本設計](rockstaros-complete-design.md) の一般構想と、本書の実装範囲を区別する。

## 1. 今回の到達目標

自動化OSの中核である「端末保存→条件実行→別Tool→成果物→本人確認」を、ビルド可能なAndroidコードへ落とす。記事準備は基盤の最初の検証題材であり、これだけで自動化OSの市場価値が検証できたとはしない。元のファンド/収支試算とWeb/PCの機能は変更しない。

初回の設計完了OS01は要件整理・基本構成案の完了であり、詳細設計やOS成立性の確認完了ではない。今回もOS03/04/05をまとめて完了にしない。

## 2. 実装した部品と責務

| 部品 | 実装 | 残る境界 |
| --- | --- | --- |
| 実行コア | `android/core` のJava11互換コード。Work/Run/Attempt、SQLite transaction、結果hash、再送排除、全停止、手動再試行、最終確認 | 1ユーザーDB・固定直列2工程。汎用DAG/遠隔所有権は未実装 |
| 端末DB | Android SQLiteとホストJDBCで同じSQL/コアを使用 | ホストSQLiteの成功はAndroidファイル暗号化/実電源断の証拠ではない |
| Tool API | AIDL v1、32 KiB文字列、callbackのUID/token検証、固定署名/版の確認 | FD転送、公開SDK、別作者の鍵登録は未実装 |
| 自社Tool | 出典整理/無料版作成を別APKへ移植 | 同一APK内の2操作。ココナラ2ツールはまだPC/Webのみ |
| Android実行接続 | persisted JobScheduler、BOOT_COMPLETED、充電/熱条件、停止時の実行取消 | 標準Androidの制約内。独自OS特権schedulerではない |
| 操作 | 別APKの`dev.rock.shell`から専用Binderで入力・停止/再開・状態・成果物・最終確認を操作。永続dataはBrokerだけが保持 | OSのホーム置換、通知Inbox、ファイル取込/書出しは未実装 |
| OSへの組込 | Soong `Android.bp` とCuttlefish製品設定、AOSP参照固定 | 設定を作った段階。Soong全体のbuild/起動はまだ未検証 |

Javaを選んだ理由は、OS側とホストテストで業務コアを共通化し、Kotlin/Composeの依存を初回の接続検証へ持ち込まないため。Kotlin/Composeを用いるシェルの将来案は撤回しない。

### Platform Core v1（OS10、native build未実行）

Broker／Shell／Toolの3 APK構成へ、Tool／MCP／Provider共通の`IPlatformApi`、導入済みAPKのUID・version・署名照合、component capability allowlist、端末credentialを使う二段階承認、費用上限、停止・永久失効、owner別追記型Wallet receipt、v1→v2 DB migration、Android Keystore AES-GCM backup、更新／rollback互換性gateを追加した。Home／Sky／ZemaのShellは通信権限、Platform DB、Keystore、Engine、広い管理権限を持たず、専用Binderだけを使う。Cuttlefish／物理製品設定にはsource SELinux policy directoryも接続した。詳細契約と未実行境界は[Platform Core](platform-core.md)を正本とする。

このsourceはAndroid Gradle build／lintとAndroid 15 emulatorのShell→Broker Binder統合試験に合格した。Soong full buildとSELinux compiler、enforcing bootは未実行である。したがってOS10は進行中、production署名・OTA rollback・Pixel実機受入はOS11の未着手gateとし、Gradle／emulator成功をOS imageの合格へ転用しない。

## 3. 業務とデータの詳細

- 利用者が原稿、まとめ3〜5項目、無料範囲、価格表示、完全版の内容/URLを入力し、端末保存・自動実行へ明示同意する。外部への投稿・購入・送金は行わない。
- 仕事は最大100件、入力/各出力は32 KiB以下。これはDB全体の容量上限ではなく、手動再試行を重ねたイベント履歴の保持上限は未実装。原稿はcredential-encryptedなアプリ専用DBへ保存し、Android backupを無効化。独自Keystore暗号化/削除・保持設定は未実装なので合成原稿だけを使う。
- `works.request_key` は一意。同キー・同入力は既存Workを返し、同キー・別入力/サンプル設定は競合として拒否。
- `runs` は(work_id,step)で一意。0番だけqueued、1番はpending。最初のpassed出力を次工程の入力hashに結び付ける。
- claimはDBの書込transaction内で1件だけ取得し、attempt UUID、boot ID、単調時計の60秒期限を保存する。同一端末で同時claimしない。
- finishは現行token、boot、期限、停止状態、Work状態を再確認する。成果物・工程状態・次のqueued行・イベントを同じtransactionで確定する。P1はDBキューの再走査を使用し、未実装の外部outbox配信を稼働中と呼ばない。
- プロセス終了/端末再起動後は期限切れまたは別bootの実行を再試行。最大3試行後はneeds_review。副作用のない自社変換だけなので再計算が可能。外部送信Toolは契約に存在しない。
- 手動再試行は失敗/確認要の1工程だけを戻す。通過済み工程は戻さず、sample/cancelled/completedの昇格・復活は拒否する。
- 中止/全停止はtokenを無効化する。遅れて返る結果を採用しない。Toolには協調停止を伝えるが、任意コードの強制終了保証はない。
- イベントは種類・工程番号だけで原稿を含まない。成果物の読込時にhash不一致なら停止し、DBの未知版や破損を黙って消去しない。

SQL正本: `android/core/src/main/resources/schema.sql`。WebのD1 migrationとは別DBで、既存0002は変更しない。

## 4. Androidバックグラウンド処理の実際

JobSchedulerは15分以上の周期の永続ジョブを1件登録し、充電条件を要求する。定時実行を保証せず、空キューの監視も含む最初の接続方式。最大8工程/起動の処理枠を設ける。充電断やOS停止では協調停止・lease無効化、重大な熱状態では延期する。BOOT_COMPLETED/MY_PACKAGE_REPLACEDで登録を回復する。

この設計は常時CPUを使う特権daemonではない。省電力を回避するroot権限やDozeの全面無効化は導入しない。独自OSの電源管理への統合・72時間試験はOS03/04の残作業。[JobService](https://developer.android.com/reference/android/app/job/JobService)、[AIDL](https://developer.android.com/develop/background-work/services/aidl)

## 5. ビルドと確認

### ホスト共通コア / Android APK

Java17、Gradle8.11.1、Android SDK API35 / Build Tools35.0.0を使用する。AGP8.9.2で固定。API35以上のAndroid向けで、AOSP16の仮想OSにも同じソースを組み込む案。[AGP互換表](https://developer.android.com/build/releases/agp-8-9-0-release-notes)

```sh
# Java/Gradleが準備された環境。core:testだけならAndroid SDKは不要。
gradle -p android :core:test
npm run os:parity
npm run os:check

# Android SDKが準備された環境
gradle -p android :automation:assembleDebug :article-tool:assembleDebug
gradle -p android :automation:lintDebug :article-tool:lintDebug
gradle -p android :tool-sdk:testDebugUnitTest

# データのない使い捨てエミュレーターを明示的に選択して実行
# adb installは選択した仮想端末に試作Toolをインストールする。
adb -s <エミュレーターのserial> install -r android/article-tool/build/outputs/apk/debug/article-tool-debug.apk
# 他の端末を切り離したテスト環境で、BrokerとテストAPKを導入して実行する。
gradle -p android :automation:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.rockAcceptanceTarget=emulator \
  -Pandroid.testInstrumentationRunnerArguments.notClass=dev.rock.automation.LocalAiServiceIntegrationTest

# 既存Web/PCの回帰検証は別に継続
npm run verify
```

macOS/外付けExFATではAppleDouble補助ファイルがGradleの生成物削除と衝突した。生成物だけをローカルAPFS等へ移す場合は `-ProckBuildRoot=/絶対パス/生成物専用ディレクトリ` を付け、`node --experimental-strip-types scripts/check-os-parity.mjs /同じディレクトリ/core/classes/java/main` を使う。ソース/履歴は移動しない。

GitHubの `.github/workflows/android.yml` は共通コアテスト、Broker／Shell／Toolの3 APKのbuild/lint、言語間照合に加え、使い捨てのAndroid35エミュレーターで実Binder/SQLiteの接続試験を行う。標準Google APIsイメージであり、自前Rock OS/Cuttlefishの起動ではない。実機は操作しない。レポートを7日保存し、全試験成功時だけ署名とhashを照合した3 APKを[Pixel 10向けのP1アプリ試験](android-trial.md)の成果物として7日保存する。APKのストア公開や正式OS配布ではない。

試験引数 `rockAcceptanceTarget` の既定値は `physical` で、backupの2つのhardware-backed鍵とeSIM/A2Aのhardware attestation受入を要求する。GitHubの使い捨て端末では `emulator` を明示し、Androidのhardware名が `ranchu` / `goldfish` の場合だけ、backupのsoftware Keystore観測と同期済み暗号化ファイルを検査する。同じprofileでeSIM/A2Aのhardware必須鍵の発行拒否・alias残留なしを検査し、実機合格へ換算しない。Shell・automation・operatorの3suiteは `--continue` で全て実行し、1件でも失敗した場合はCIを失敗にする。

2026-09-05、commit `47043ad` の[Android CI](https://github.com/k999ln/rock/actions/runs/33982932964)でコア16・SDK4・端末接続2テスト、2APKのbuild/lint、Java↔TypeScriptの36項目照合が成功した。端末試験では実Tool APKのBinder呼出、Android SQLiteを閉じて開き直した後の次工程、成果物の保存、二重結果の拒否、本人確認を検証。もう1件は充電必須・永続周期ジョブの登録と権限設定を確認した。実際の周期発火・画面OFF・OS再起動・不正署名/UIDの拒否はまだ検証していない。

### 開発端末での試験（まだ実施していない）

本人が用意した合成データだけのAndroid15以上の端末/仮想端末で、開発APKの試験を行う。これはブートローダー解除やOS書込を必要としない補助トラック。

1. 同一の開発署名でbuildしたautomationとarticle-toolを導入する。入力は合成原稿だけ。
2. 作業を保存し、充電条件を満たしてアプリ画面を閉じる。2工程の後にreviewとなり、成果物が読めることを確認。
3. 実行途中のプロセス終了、充電断、再起動・再unlock、全停止、サンプル、異常入力を試験。
4. 署名不一致/版不一致のTool、別UIDからのstart/callback、改変成果物を拒否することを試験。
5. 症状、端末build、API、期待値/実際値を検証記録へ残す。正常なBinder接続と、不正UID等の拒否・省電力下の動作は別試験として記録する。

## 6. 実OSのビルド経路

`os/source-lock.json` は仮想開発用に、調査時に存在を確認した `android-16.0.0_r4` とmanifest commitを固定する。最新セキュリティ版だと断定せず、実機/配布用の採用版にはしない。全ソース取得後に各projectのrevisionも `repo manifest -r` で保存する。[公式manifest](https://android.googlesource.com/platform/manifest/+/15128c9e27cfa599c48d294babd39286ee8f1426/default.xml)

現在のMacにはAOSPに必要なLinux/x86-64/KVMと空き400GBの条件がそろっていない。`npm run os:host` は読み取りだけの適合確認で、条件不足なら終了コード2となる。OS02の未決機材を推測して契約・購入・起動しない。

Linux環境を確保した後の手順:

1. 空の専用作業ツリーで、固定manifest URL/tagから `repo init`、`repo sync`。`.repo/manifests` のcommitがlockの値と一致することを確認する。
2. cleanなrock checkoutで `node scripts/render-os-manifest.mjs` を実行すると、そのcommit固定のlocal manifest XMLを標準出力へ生成する。AOSP作業ツリーの `.repo/local_manifests/rock.xml` へ保存してsyncすれば `device/rock` に入る。dirtyなソースでは生成を拒否する。Webのnode_modulesや生成物をコピーしない。
3. `build/envsetup.sh` を読み込み、`os/source-lock.json` と製品設定のlunch targetを照合して選択する。
4. まずSoongで `RockAutomationPrototype` と `RockArticleToolPrototype` をbuildし、その後OSイメージをbuildする。
5. Cuttlefishで起動し、上のAndroid試験とOS起動の証拠を採取する。失敗時はソース/製品設定を修正する。

この経路は**未実行の手順**。製品makefileの存在やAPKのcompile成功だけでOS build/boot成功とはしない。P1はBroker／Shell／Toolの3 APKと特権境界のsourceを組み込む段階で、AOSPの最終Home置換、SELinux enforcing実証、独自OTAは次段階。

Gradleはpackage/versionをbuild設定から補うが、Soongではその設定を読まない。そのため `src/aosp/AndroidManifest.xml` にpackageとversionを明示し、それ以外が `src/main` と一致することを `os:check` で検査する。APKで通った設定が自動でOSビルドへ引き継がれるとは仮定しない。

参照したr4のrelease mapでは `aosp_current` は `bp4a` のalias。選択するlunchは `rock_cf_x86_64_phone-aosp_current-userdebug`。[固定版のrelease map](https://android.googlesource.com/platform/build/release/+/refs/tags/android-16.0.0_r4/release_config_map.textproto)

## 7. 次の作業と受入条件（2026-10-11）

1. `7f5ed361`のAndroid CIとJUnit／instrumentationは確認済み。さらにsourceを変更する場合は新しいSHAのCIを確認し、配布前には対象APK hashを固定する。以前の合格を後続修正や実機へ転記しない。
2. 同一候補の合成Cloud Agentで見積→native hold→明示承認→切断→再接続→同jobの進捗・結果・精算receiptを接続検証する。実Provider鍵・契約・請求・fundingを未受入のまま本番executionを有効化しない。
3. 現行APKを対象にPixel 10 GL066の画面ロック／unlock、プロセス終了・再起動、セッション失効／再連携、同一ID復旧を非破壊で受け入れる。過去のPixel合格とAPI 35 emulatorの物理専用skipは別に扱う。
4. 全OSは[Device Preview手順](phone-preview-20260911.md)に従い、専用Linux x86_64・source／vendor inventory・同一imageのbuild検査条件を満たしてから進める。正式署名・純正復旧artifact・backup復元・rollbackのgateが揃うまでflashを行わない。CuttlefishとLinux/QEMUの成功もPixel full OSへ転用しない。
5. 第三者作者の導入／失効、強制資源隔離、ファイル保持／export、通知、実業務接続・費用計測は[進捗・再開条件](../project.md)と各workstreamの残課題から選ぶ。既存のPlatform Core／SDK／backup契約を再利用し、旧P1の未実装一覧だけで作り直さない。

作業進捗: [project.md](../project.md)。検証した範囲と残課題: [検証記録](validation.md)。
