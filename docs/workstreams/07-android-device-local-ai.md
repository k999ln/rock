# Android / Device / Local AI

## 目的

共通RockstarOS Coreを正確な機種／SKU向けDevice Support Packageへ組み込み、Android/AOSPのfull build、署名、flash、boot、OTA、rollback、純正復旧を実機で成立させる。端末内AIはこの実機基盤の上で最小権限にする。

## 現在地

- Android P1はBroker／Shell／Toolの3 APK、SQLite、Binder、JobSchedulerを実装。Shell API v4でnative Sky選択をBroker SQLite schema v2へ保存し、Zemaをselection tokenへ固定したうえで、所有者24単語backup v2のexport／importを追加した。Android 15 emulatorはBroker 11件＋物理専用2件skip、Shell 5/5を合格。所有Pixel 10ではBroker／Tool／Local AI／Wallet 11件、Shell 5件、Operator Agent 5件、実再起動2段階の計23/23が合格し、native Sky selection、途中仕事、結果、review、履歴、非破壊backup exportを復旧した。data／Keystore消去後の24単語復元は純正復旧artifactを揃えた管理試験として残る。
- 最初の実機対象は読取り専用ADBで日本向けPixel 10／frankel／GL066へ確定。Pixel 7／pantherは保留。物理端末gateは機種／SKUのみ合格の1/6。SELinux enforcing分離とCDD／CTS／CTS Verifier／VTSを独立した未達gateにした。
- GrapheneOS `2026091000` tag署名、manifest／adevtool／laguna-muzel 6.6、実機のDynamic Partition／Virtual A/B／AVB 1.4を固定済み。Google純正factory／full OTAの公式URL・掲載SHA-256・同一build・実byte hash検査、vendor全file inventory／再検証、署名policy／手順hash freezeをbuild入口へ実装し、合成fixture 9/9が合格した。Google実ファイル、実vendor生成、HSM／署名bridge、full Soong build、flash、実機bootは未実施。
- 外部Providerは初回OS full buildから分離し、アプリ／サーバー側へ置く。実収益を表示する1.0公開前にはProvider sandboxを必須とし、未合格中はlive収益表示をしない。
- Local Action Assistantはsource pin、base＋plan-v2 overlay hash検査、署名限定Binder API v2、JSON Schema計画専用経路、arm64 APK build、Qwen GGUFの機内モード推論、再起動復元、33分22秒の実機熱試験まで合格。最初の選択Toolとの実機接続と全23項目の非破壊再起動受入も合格した。OS image搭載、production署名、SELinux／OTA、Keystore消去後の復元は未完了。
- Jev / Local Qwen Decision Fabricの`AI07`はhost側の型・Router・Harness・Mock・TypeSafe shadow adapterに加え、独立した`android/jev-provider` optional source moduleを追加した。`dev.rock.jev.provider`は専用UID／`rock_jev_provider_app` domainを持ち、公式TypeSafe endpointへpublic-only typed requestをboundedに送る設計だが、manifest applicationはdisabled、product既定除外、safe runtime key provisioning未実装である。既存のBroker／Shell／Tool契約とnetwork権限は変更していない。独立した`dev.rock.jevpreview` debug APKの固定公開choice fixture→Mac loopback relay経路も保持するが、これはAndroid BinderのLocal AI接続や製品routeではなく、Pixel上の実行とTypeSafe API本接続は未受入のままである。
- Operator Agentは試験署名Pixel 5/5に加え、本番公開trust入力をrepo外から静的RROへstageする検査を実装した。StrongBox必須、factory reset無効、P-256／origin／challenge検証と、challengeへ結び付く端末鍵aliasをAndroid 15 emulator 6/6で確認した。本番値投入、attestation検証、Device Owner実行、複数端末向けdynamic enrollmentは未完了。
- Platform Core v1はTool／MCP／Provider共通AIDL、APK署名・UID照合、本人確認付き承認、Wallet台帳、schema v1→v2 migration、dual-wrapped backup v2、所有者phrase UI、transactional restore、新Keystore再binding、更新／rollback gate、source SELinux policyまで実装中。`dev.rock.automation`をheadless Brokerとして残し、Home／Sky／Zemaを`dev.rock.shell`へ分離するsource、Android Gradle build／lint、emulatorとPixelのBinder統合試験は完了。物理wipe復元、AOSP full build、SELinux enforcing boot、production署名は未実施。

主なtask: `DSP01`, `OS02`〜`OS11`, `N03`〜`N05`, `RLS02`。Local AIは`OS07`〜`OS09`、Platform Coreは`OS10`〜`OS11`で追跡する。新設計のモデル更新・記憶・外部作用・app能力は未着手の`AI02`〜`AI05`として分ける。

## Jev physical-Pixel Developer Preview（debug専用・実機未検証）

このpreviewは、stock GrapheneOSのPixel 10（`frankel`／GL066）へ独立した`dev.rock.jevpreview` debug APKを入れた場合に、一つのボタンから固定公開fixtureを一度だけ読むための開発者経路である。既存のBroker／Shell／Tool APKは導入・更新せず、OS imageのflash、AIDL変更、Broker／Tool実行、任意入力、端末のAPI key保存は行わない。TypeSafe API keyはMac上のrelayプロセスへ実行時だけ渡し、APK、UI、Git、端末リクエストへ送らない。

### Mac relayの制限

- `scripts/jev-pixel-relay.mjs`は`127.0.0.1:49211`だけへbindし、`POST /v1/pixel-jev-preview`以外を拒否する。
- request bodyは`{"fixture":"public-choice-v1"}`だけを許可し、端末の文章、Tool id、action、個人データは受け取らない。
- `TypeSafeJevProvider`へ固定したpublic state／choice questionを一度だけ渡す。timeoutは10秒、estimated costは100 micros、request上限は1000 micros、attemptは1で、provider call後にlistenerを閉じる。relayは2分で自動終了する。
- responseは`status`、`answer`、`token`、`model`だけに制限し、provider error本文、request本文、keyを返さない。成功状態は`status: "ok"`かつ`answer: "local"`で、modelはproviderが返した`jev-*`を表示する。

### 実行手順（未実行）

1. Macで独立したAndroid debug artifactとrelay testを作る。release artifactも作り、debug専用のnetwork permissionとlauncherがreleaseへ混ざらないことを確認する。

   ```sh
   gradle -p android :jev-preview:assembleDebug :jev-preview:assembleRelease :jev-preview:testDebugUnitTest :jev-preview:lintDebug :jev-preview:lintRelease --no-daemon
   node --experimental-strip-types --test tests/jev-pixel-relay.test.mjs tests/android-jev-preview-boundary.test.mjs
   AAPT="$ANDROID_HOME/build-tools/35.0.0/aapt"
   ! "$AAPT" dump permissions android/jev-preview/build/outputs/apk/release/jev-preview-release-unsigned.apk | grep -F 'android.permission.INTERNET'
   "$AAPT" dump permissions android/jev-preview/build/outputs/apk/debug/jev-preview-debug.apk | grep -F 'android.permission.INTERNET'
   ```

   Android SDK Build Tools 35.0.0の`aapt`と`apksigner`、Android Platform Toolsの`adb`、Gradle 8.11.1以上が必要である。`ANDROID_HOME`または各toolが見つからない環境ではbuild／署名検査／端末導入を実行せず停止する。

2. 端末が所有対象のstock GrapheneOS Pixel 10であることを、明示したserialの読取り専用検査で確認する。このpreviewは既存アプリを更新せず、独立したdebug APKだけを対象にする。端末が接続されていない場合はここで停止する。

   ```sh
   SERIAL='<adb serial>'
   python3 scripts/inspect-phone.py --serial "$SERIAL"
   adb -s "$SERIAL" get-state
   ```

   install前に、既存の`dev.rock.jevpreview`がある場合はそのpackageの署名を端末上で確認し、CI artifactのpreview debug APKとcertificate digestが一致するときだけ続行する。署名不一致時にuninstallで回避せず停止する。Broker／Shell／Tool APKのinstall／更新はこのpreviewの手順に含めない。debug APKの証明書を確認するコマンド例は次のとおりである。

   ```sh
   APKSIGNER="$ANDROID_HOME/build-tools/35.0.0/apksigner"
   CHECK_DIR="$(mktemp -d work/jev-preview-device-check.XXXXXX)" || exit 1
   trap 'rm -rf "$CHECK_DIR"' EXIT HUP INT TERM
   LOCAL_CERT="$("$APKSIGNER" verify --print-certs android/jev-preview/build/outputs/apk/debug/jev-preview-debug.apk | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')"
   if DEVICE_APK_PATH="$(adb -s "$SERIAL" shell pm path dev.rock.jevpreview | tr -d '\r' | sed -n 's/^package://p' | head -n 1)" && test -n "$DEVICE_APK_PATH"; then
     case "$DEVICE_APK_PATH" in /data/app/*/base.apk) ;; *) echo 'Installed Jev preview APK path unavailable; stop.' >&2; exit 1 ;; esac
     adb -s "$SERIAL" pull "$DEVICE_APK_PATH" "$CHECK_DIR/installed-jev-preview.apk" >/dev/null
     INSTALLED_CERT="$("$APKSIGNER" verify --print-certs "$CHECK_DIR/installed-jev-preview.apk" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')"
     test -n "$LOCAL_CERT" && test "$LOCAL_CERT" = "$INSTALLED_CERT" || { echo 'Jev preview signer mismatch; stop without uninstall.' >&2; exit 1; }
   fi
   adb -s "$SERIAL" install -r android/jev-preview/build/outputs/apk/debug/jev-preview-debug.apk
   ```

   `pm path`で既存packageが見つかるのにbase APKを取得できない場合、証明書を比較できない場合、または既存packageが別署名の場合は停止する。取得したAPKはignoredな`work/`へ一時保存して比較後に削除する。release APKはこの手順へ入れない。

3. Macの別terminalでkeyを画面へechoせず環境変数へ一時設定し、relayを一回だけ起動する。keyの値をコマンド、ファイル、ログへ書かない。

   ```sh
   bash -c 'read -r -s -p "TypeSafe API key (Mac memory only): " TYPESAFE_API_KEY; printf "\\n"; export TYPESAFE_API_KEY; node --experimental-strip-types scripts/jev-pixel-relay.mjs; unset TYPESAFE_API_KEY'
   ```

   relayが`127.0.0.1:49211`で待機していることだけを確認する。起動時にkeyを表示しない。

4. relayを起動したMac terminalを保持したまま、端末とMacのTCP portを一対一でreverseする。

   ```sh
   adb -s "$SERIAL" reverse tcp:49211 tcp:49211
   adb -s "$SERIAL" reverse --list
   adb -s "$SERIAL" shell am start -n dev.rock.jevpreview/.MainActivity
   ```

5. Jev Pixel Previewの`Jev公開fixtureを確認（debug only）`を一度だけ押す。UIに`ok`、`local`、provider model、input/output tokenが出て、Mac relay terminalに同じ4項目だけのJSONが一行出て、relay listenerが閉じれば一回の検証である。`RELAY_UNAVAILABLE`、`timeout`、`provider_unavailable`、`budget_blocked`、`invalid_response`は失敗状態であり、自動retryせず停止する。

6. 終了時にreverseを外し、relayを停止する。実機を接続していない開発環境ではこの手順を実行しない。

   ```sh
   adb -s "$SERIAL" reverse --remove tcp:49211
   ```

このrunbookのbuild、relay protocol test、APK manifest境界はCIで検査する。CIは`jev-pixel-preview-debug-<run ID>`としてdebug APKだけをartifactに保存し、既存のAndroid P1 artifactは変更しない。Pixelへのinstall、`adb reverse`、TypeSafe実接続、物理画面の結果、費用の実額、Android／OS統合の受入はまだ検証していない。

## Optional Android Jev provider source（既定除外・disabled）

`android/jev-provider`は、友人が後でbuildできるRockstarOS sourceとして、TypeSafe公式`POST https://api.typesafe.ai/v1/systemone`のAndroid実装境界を保存する。`state`、固定`jev-1.13.0`、typed `questions`だけを送り、request／response size、question数、score levels、latency、事前費用見積りを制限する。responseはexact schemaと確率合計を検査し、失敗は`abstained`へ落とす。結果にはTool／Broker／Shell／Local AIの権限を与えず、`externalActionAllowed=false`を固定する。

安全なAPI key provisioning、Keystore／secret store、rotation／失効、owner同意をまだ受入していない。そのためmain manifestのapplicationは`enabled=false`、`allowBackup=false`、launcher・exported service・shared UIDなしで、`ROCK_JEV_PROVIDER_MODE`を指定しない限りSoongの`RockJevProvider`もproductへ入らない。`optional`指定時もdisabled状態を維持する。これはsource／契約／境界の実装であり、Gradle／Soong build、emulator、Pixel、TypeSafe live call、実費、OS image搭載の成功証拠ではない。

### 直接検証

- `node --test tests/android-jev-provider-boundary.test.mjs`：manifest、network permission、disabled、固定endpoint、public-only、bounded、advisory-only、Soong／product／SELinux境界。
- `gradle -p android :jev-provider:assembleDebug :jev-provider:testDebugUnitTest :jev-provider:lintDebug --no-daemon`：Android SDK／Gradle環境で実行するprovider sourceの直接検証。現在のMacではGradle executableがないため未実行。

## 次に進める順番

1. 完了: 実端末からPixel 10、GL066、frankel、locked／yellow boot状態を読取り専用で確認した。
2. 進行中: source、kernel、partition、AVB、Operator公開設定、復旧／vendor／署名手順の検査入口は固定済み。本人がGoogle利用条件を確認後、frankel用factory imageと対応full OTAをrepo外へ取得して検査し、full source上でadevtoolを実行して実inventoryを固定する。本番Operator公開値とHSM／署名bridgeは別gateとして残す。
3. Ubuntu 24.04 x86_64の十分なbuild環境でfull source取得、vendor生成、Soong buildを行う。
4. Sky／Wallet／Game接続層をAndroidへ移植し、UID、SELinux、暗号化、電源制約を受け入れる。
5. production署名、flash、boot、hardware、CTS/VTS、OTA/rollback、純正復旧を同じ端末・buildで検証する。
6. 完了: test署名のLocal AI service／APK、GGUF、airplane mode、Tool結合、熱・RAM・30分超を追加受入した。最終imageではproduction署名とSELinux enforcing条件で再受入する。

## 完了条件

- exact model/SKUとbuild fingerprintが証拠に固定される。
- QEMUやemulatorの成功を実機へ転用しない。
- Local AIの変更系Toolは本人確認なしに実行しない。
- debug署名、未審査weight、任意root/shellを製品へ含めない。

## 関連資料

- [AIネイティブOS詳細設計とapp／OS能力差](../ai-native-os-architecture.md)
- [Jev / Local Qwen Decision Fabric設計](../jev-local-qwen-decision-fabric-design.md)
- [Device support architecture](../device-support-architecture.md)
- [Phone preview](../phone-preview-20260911.md)
- [Android trial](../android-trial.md)
- [Local AI integration](../local-ai-os-integration-20260915.md)
- [Platform Core](../platform-core.md)
- [Android backup recovery](../android-backup-recovery.md)
- [Android production architecture](../android-production-architecture.md)
- [Device matrix](../../data/device-support-matrix.json)
- [Android release audit](../../data/android-physical-release-audit.json)

## 検証

- `npm run device-support:check`
- `python3 -m unittest tests/test_prepare_phone_build.py tests/test_stage_local_ai_apk.py tests/test_freeze_phone_build_inputs.py`
- `gradle -p android :core:test :shell-api:assembleDebug :automation:assembleDebug :shell:assembleDebug :article-tool:assembleDebug :automation:lintDebug :shell:lintDebug :article-tool:lintDebug --no-daemon`
- `gradle -p android :jev-preview:assembleDebug :jev-preview:assembleRelease :jev-preview:testDebugUnitTest :jev-preview:lintDebug :jev-preview:lintRelease --no-daemon`
- 同一debug signerのLocal AI／Broker／Tool／Shellを導入したAndroid 15 emulatorでBroker 11 non-skipped testとShell 5 testを実行し、モデルなし0件停止、schema migration、選択復元、不正token拒否、phrase確認、v2 export、新Keystore再bindingを確認する。stock Pixelはseed後に実再起動し、別processのrecover phaseでlease回収、2 Tool、結果、7履歴eventまで確認する。物理wipe復元は純正復旧artifactを揃えた別の管理試験にする。従来のplan受入は[証拠](../evidence/android-local-ai-plan-v2-20260916.json)、backup emulator受入は[証拠](../evidence/android-backup-v2-emulator-20260916.json)。
- 対象端末のflash／boot／OTA／rollback／stock recovery受入
