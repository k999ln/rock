# Android / Device / Local AI

## 目的

共通RockstarOS Coreを正確な機種／SKU向けDevice Support Packageへ組み込み、Android/AOSPのfull build、署名、flash、boot、OTA、rollback、純正復旧を実機で成立させる。端末内AIはこの実機基盤の上で最小権限にする。

## 現在地

- Android P1は2 APK、SQLite、Binder、JobScheduler、標準emulator CIに加え、所有Pixel 10で5/5 instrumentationまで到達。
- 最初の実機対象は読取り専用ADBで日本向けPixel 10／frankel／GL066へ確定。Pixel 7／pantherは保留。物理端末gateは機種／SKUのみ合格の1/5。
- GrapheneOS source lock、build準備script、Rock組込み設定はあるが、full Soong build、flash、実機bootは未実施。
- Local Action Assistantはsource pin、hash検査、署名限定Binder client/server契約、overlay、arm64 APK build、Qwen GGUFの機内モード推論、再起動復元、33分22秒の実機熱試験まで合格。OS image搭載、production署名、SELinux／OTA／復旧は未完了。
- Platform Core v1はTool／MCP／Provider共通AIDL、APK署名・UID照合、本人確認付き承認、Wallet台帳、schema v1→v2 migration、Keystore暗号化backup、更新／rollback gate、source SELinux policyまで実装中。Android/AOSP buildとenforcing bootは未実施。

主なtask: `DSP01`, `OS02`〜`OS11`, `N03`〜`N05`, `RLS02`。Local AIは`OS07`〜`OS09`、Platform Coreは`OS10`〜`OS11`で追跡する。

## 次に進める順番

1. 完了: 実端末からPixel 10、GL066、frankel、locked／yellow boot状態を読取り専用で確認した。
2. 対象GL066向けBSP、vendor、kernel、partition、AVB、stock recoveryをhash付きで固定する。
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

- [Device support architecture](../device-support-architecture.md)
- [Phone preview](../phone-preview-20260911.md)
- [Android trial](../android-trial.md)
- [Local AI integration](../local-ai-os-integration-20260915.md)
- [Platform Core](../platform-core.md)
- [Device matrix](../../data/device-support-matrix.json)
- [Android release audit](../../data/android-physical-release-audit.json)

## 検証

- `npm run device-support:check`
- `python3 -m unittest tests/test_prepare_phone_build.py tests/test_stage_local_ai_apk.py`
- `gradle -p android :core:test :automation:assembleDebug :automation:connectedDebugAndroidTest --no-daemon`
- 対象端末のflash／boot／OTA／rollback／stock recovery受入
