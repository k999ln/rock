# Local Action AssistantのRockstarOS導入

導入段階は`PHYSICAL_STANDALONE_ACCEPTED_NOT_IN_IMAGE`。`local-action-assistant`をavocadoOSのローカルLLM実装として固定し、arm64 release APKのnative build、Android emulatorのBinder結合、所有Pixel 10 GL066上のGGUFオフライン推論・再起動復元・33分22秒の熱試験まで確認した。これは正式署名、Soong／OS image搭載、SELinux、OTA、rollback、復旧の完了を意味しない。

## 今回接続した範囲

- `os/physical/local-action-assistant-source-lock.json`で上流commit `99b1c40d76f719cbba9c72d9f481c1b2df245504`、MIT license、Android package `com.localactionassistant`、`llama.rn` 0.12.9、レビュー済み主要ファイルのSHA-256を固定する。
- `scripts/prepare-phone-build.py manifest`がRock本体とLocal Action Assistantの2 repositoryを完全なcommitでGrapheneOSのlocal manifestへ出力する。
- `prepare`はLocal Action Assistantのrevision、clean worktree、主要ファイルhash、package/runtime版、release variantの`INTERNET` permission除去、GGUF未同梱を検査する。
- source同期後は`python3 external/rockstaros/scripts/prepare-phone-build.py verify-local-ai <OS-tree>`だけでも同じ読取り専用検査を実行できる。
- `contracts/local-ai-runtime.json`と`android/local-ai-api`でroute ID、Binder API v1、6 tool、stream event、変更系toolの確認必須条件を機械可読にした。
- `RockAutomationPrototype`へ固定package・同一署名・version 1を要求する呼出しclientと接続診断を追加した。応答は32 KiB、90秒で打ち切り、未知eventを拒否する。
- 固定commit上で`npm run verify`を実行し、TypeScript、Jest 4 suite／10 test、ESLint、offline manifest source検査を合格した。結果は`docs/evidence/local-ai-source-validation-20260915.json`へ記録した。
- `scripts/stage-local-ai-apk.py`はAPKのlock、ZIP安全性、package/version、arm64 native library、`INTERNET`権限なし、`WAKE_LOCK`、署名限定Binder権限を検査し、`vendor/rockstaros-local-ai`へSoong moduleを生成する。artifact lockにはレビュー済みunsigned APKのSHA-256 `2a0441565f6cca5676bc7a113f74e66e734c5e966aaf3835a62ae9b79d4756e9`と26,390,540 bytesを固定した。
- 物理OS build入口はレビュー済みAPKと`aapt2`を必須入力にし、repo全体のrevision検査後にもstaged APKを再照合する。product makefileもstageがなければbuildを拒否する。
- 固定SHAの`local-ai-overlay.patch`に、署名Binder service、React Native native module、Headless JS推論、stream、cancel、proposalの一時保存と別確認を実装した。`prepare-local-ai-runtime.py`はcleanな固定commitから使い捨てbuild treeを生成し、overlay hashと適用可否を確認する。
- 生成したclean overlay treeでclient/server AIDLのbyte一致、TypeScript、ESLint、Jest 10件に加え、Kotlin／AIDL／llama.rn CPU-only arm64 native compileとrelease APK buildを合格した。APKは`arm64-v8a`のみ、`INTERNET`なし、`WAKE_LOCK`、署名保護Binder serviceを含む。
- `.github/workflows/local-ai-apk.yml`はUbuntu、Java、Android SDK 36、NDK 27.1で固定sourceとoverlayからunsigned arm64 APKをbuildし、package/version、通信権限、ABIを検査した7日間の候補artifactを出力する。workflowの存在はbuild成功証拠ではなく、artifact lockを自動更新しない。
- Android 15 API 35のPixel 10 device-profile emulatorへtest鍵で署名したcopyを導入し、同一署名検査、Binder接続、Headless JS起動、GGUF未導入時の`NO_MODEL` fail-closedを含む5 instrumentation testを合格した。test鍵copyは配布artifactではない。
- 所有Pixel 10 GL066／Android 17へ同じ試験署名の4 APKを導入し、物理端末でも5 instrumentation testを合格した。Qwen3-0.6B Q8_0 GGUFを公式SHA-256とApache-2.0表示でimportし、機内モードかつWi-Fi停止中の推論、端末再起動後の会話／model metadata保持と手動reload、33分22秒・15推論の熱試験を合格した。最大電池温度34.4℃、thermal status 0、process restart 0。[実機証拠](evidence/android-pixel-10-gl066-local-ai-20260916.json)。
- 初回検証で、親Git配下ではoverlayが黙ってskipされる問題、AIDL生成無効、public Android SDKで使えない`UserHandle` API、release manifestによる`WAKE_LOCK`削除を検出して修正した。親Git配下とpermission退行の再発防止testも追加した。
- product propertyはまだ`source-pinned`とだけ表示する。アプリを`PRODUCT_PACKAGES`へ追加していないため、現在のimageにLLMは入らない。

## OS内で呼び出せるようにする残作業

1. レビュー済みAPKをSoong stagingし、OS image内で同一内容が署名・搭載されることを照合する。production target-filesでは正式release keyへ置換し、test鍵を採用しない。
2. 完了: Qwen3-0.6B Q8_0 GGUFのライセンス、SHA-256、RAM／温度／速度を確認し、物理Pixelへimportした。weightはsource repositoryへ同梱しない。
3. 完了: 物理Pixelでairplane mode推論、Binder／Tool結合、保存／再起動、RAM、30分超の温度を受け入れた。
4. 最終imageでSELinux enforcing、更新、rollback、復旧を受け入れる。

対象PixelはPixel 10／frankel／GL066へ確定し、単体APKでの実機推論は合格した。使用した鍵は試験専用で、model weightの製品同梱方式も未決定。正式署名鍵、全OS build、flash、SELinux enforcing、OTA／rollback、純正復旧は未実施である。
