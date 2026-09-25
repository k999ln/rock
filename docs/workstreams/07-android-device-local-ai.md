# Android / Device / Local AI

## 目的

共通RockstarOS Coreを正確な機種／SKU向けDevice Support Packageへ組み込み、Android/AOSPのfull build、署名、flash、boot、OTA、rollback、純正復旧を実機で成立させる。端末内AIはこの実機基盤の上で最小権限にする。

## 現在地

- Android P1はBroker／Shell／Toolの3 APK、SQLite、Binder、JobSchedulerを実装。Shell API v4でnative Sky選択をBroker SQLite schema v2へ保存し、Zemaをselection tokenへ固定したうえで、所有者24単語backup v2のexport／importを追加した。Android 15 emulatorはBroker 11件＋物理専用2件skip、Shell 5/5を合格。所有Pixel 10ではBroker／Tool／Local AI／Wallet 11件、Shell 5件、Operator Agent 5件、実再起動2段階の計23/23が合格し、native Sky selection、途中仕事、結果、review、履歴、非破壊backup exportを復旧した。data／Keystore消去後の24単語復元は純正復旧artifactを揃えた管理試験として残る。
- 最初の実機対象は読取り専用ADBで日本向けPixel 10／frankel／GL066へ確定。Pixel 7／pantherは保留。物理端末gateは機種／SKUのみ合格の1/6。SELinux enforcing分離とCDD／CTS／CTS Verifier／VTSを独立した未達gateにした。
- GrapheneOS `2026091000` tag署名、manifest／adevtool／laguna-muzel 6.6、実機のDynamic Partition／Virtual A/B／AVB 1.4を固定済み。Google純正factory／full OTAの公式URL・掲載SHA-256・同一build・実byte hash検査、vendor全file inventory／再検証、署名policy／手順hash freezeをbuild入口へ実装し、合成fixture 9/9が合格した。Google実ファイル、実vendor生成、HSM／署名bridge、full Soong build、flash、実機bootは未実施。
- 外部Providerは初回OS full buildから分離し、アプリ／サーバー側へ置く。実収益を表示する1.0公開前にはProvider sandboxを必須とし、未合格中はlive収益表示をしない。
- Local Action Assistantはsource pin、base＋plan-v2 overlay hash検査、署名限定Binder API v2、JSON Schema計画専用経路、arm64 APK build、Qwen GGUFの機内モード推論、再起動復元、33分22秒の実機熱試験まで合格。最初の選択Toolとの実機接続と全23項目の非破壊再起動受入も合格した。OS image搭載、production署名、SELinux／OTA、Keystore消去後の復元は未完了。
- Operator Agentは試験署名Pixel 5/5に加え、本番公開trust入力をrepo外から静的RROへstageする検査を実装した。StrongBox必須、factory reset無効、P-256／origin／challenge検証と、challengeへ結び付く端末鍵aliasをAndroid 15 emulator 6/6で確認した。本番値投入、attestation検証、Device Owner実行、複数端末向けdynamic enrollmentは未完了。
- Platform Core v1はTool／MCP／Provider共通AIDL、APK署名・UID照合、本人確認付き承認、Wallet台帳、schema v1→v2 migration、dual-wrapped backup v2、所有者phrase UI、transactional restore、新Keystore再binding、更新／rollback gate、source SELinux policyまで実装中。`dev.rock.automation`をheadless Brokerとして残し、Home／Sky／Zemaを`dev.rock.shell`へ分離するsource、Android Gradle build／lint、emulatorとPixelのBinder統合試験は完了。物理wipe復元、AOSP full build、SELinux enforcing boot、production署名は未実施。

- 2026-09-25、AI02のhost／fixture段階を実装した（`ModelProfile`・`ModelProfiles`、schema `model_meta` v1、Engine schema v2は変更なし）。対象は、一つのruntime adapter（Local AI API v2・GGUF・`article-preparation@1/input-v1`）上の互換な2つのfixture profileで、次をJVM試験で固定した: profile IDの不変、adapterと非互換な版・未知の版の拒否、隔離試験後だけactivate、世代pointerの切替、health失敗時は前profileへrollback、失効profileへは戻さず「model利用不可」、旧workは作成時profileに固定したまま再起動後も再開、新workは新profile、別profileでの結果報告は拒否、pin中profileのretire拒否、失効pinは停止し明示replanで新revision。`LocalAiConnection`・Shell・実weightには未接続で、emulator・実機・OS統合の証拠ではない（その段階はOS10依存のまま、AI09の本人決定）。
- 2026-09-25、AI04のhost／fixture段階として`ExternalWriteOutbox`（schema `outbox_meta` v1）を実装した。external-writeだけを受け付け、`prepared → dispatched → confirmed | rejected | uncertain`で状態を管理する。JVM試験で次を固定した: 送信前に設計の項目を永続化する、同じoperation IDは同内容なら同じ結果・異内容なら拒否、provider keyを別操作で再利用しない、送信直前に権限と承認期限を再検査する、結果不明と前プロセスで開いた送信はuncertainにして自動再送しない、照会で内容hashと金額を照合して確定する、冪等再送が保証されたProviderだけ不在の報告後に同じkeyで再送できる、uncertainの取消は不在の報告後だけ、確定済みは取消せず補償操作にする。Tool・Provider・Zema・AIDLには未接続で、emulator・実機・OS統合の証拠ではない（OS10依存、AI09）。
主なtask: `DSP01`, `OS02`〜`OS11`, `N03`〜`N05`, `RLS02`。Local AIは`OS07`〜`OS09`、Platform Coreは`OS10`〜`OS11`で追跡する。新設計のモデル更新・記憶・外部作用・app能力は未着手の`AI02`〜`AI05`として分ける。

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
- [LLM・評価モデル設計（local planner / Sky OpenAI / Jev）](../llm-evaluation-architecture.md)
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
- AI02 host試験: `gradle -p android :core:test`に`ModelProfilesTest`を含む。boxではGradle/Android SDKなしのため、`javac --release 11`とJUnit 4.13.2で`android/core`のmain/testを直接compile・実行して代替した
- `gradle -p android :core:test :shell-api:assembleDebug :automation:assembleDebug :shell:assembleDebug :article-tool:assembleDebug :automation:lintDebug :shell:lintDebug :article-tool:lintDebug --no-daemon`
- 同一debug signerのLocal AI／Broker／Tool／Shellを導入したAndroid 15 emulatorでBroker 11 non-skipped testとShell 5 testを実行し、モデルなし0件停止、schema migration、選択復元、不正token拒否、phrase確認、v2 export、新Keystore再bindingを確認する。stock Pixelはseed後に実再起動し、別processのrecover phaseでlease回収、2 Tool、結果、7履歴eventまで確認する。物理wipe復元は純正復旧artifactを揃えた別の管理試験にする。従来のplan受入は[証拠](../evidence/android-local-ai-plan-v2-20260916.json)、backup emulator受入は[証拠](../evidence/android-backup-v2-emulator-20260916.json)。
- 対象端末のflash／boot／OTA／rollback／stock recovery受入
