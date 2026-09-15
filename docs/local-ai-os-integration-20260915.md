# Local Action AssistantのRockstarOS導入

2026-09-15時点の導入段階は`SOURCE_PINNED_NOT_BUILT`。`local-action-assistant`をRockstarOSのローカルLLM実装候補として固定し、GrapheneOSのRepo manifestへ追加できるようにした。これは端末OSへの搭載完了を意味しない。

## 今回接続した範囲

- `os/physical/local-action-assistant-source-lock.json`で上流commit `99b1c40d76f719cbba9c72d9f481c1b2df245504`、MIT license、Android package `com.localactionassistant`、`llama.rn` 0.12.9、レビュー済み主要ファイルのSHA-256を固定する。
- `scripts/prepare-phone-build.py manifest`がRock本体とLocal Action Assistantの2 repositoryを完全なcommitでGrapheneOSのlocal manifestへ出力する。
- `prepare`はLocal Action Assistantのrevision、clean worktree、主要ファイルhash、package/runtime版、release variantの`INTERNET` permission除去、GGUF未同梱を検査する。
- source同期後は`python3 external/rockstaros/scripts/prepare-phone-build.py verify-local-ai <OS-tree>`だけでも同じ読取り専用検査を実行できる。
- `contracts/local-ai-runtime.json`と`android/local-ai-api`でroute ID、Binder API v1、6 tool、stream event、変更系toolの確認必須条件を機械可読にした。
- `RockAutomationPrototype`へ固定package・同一署名・version 1を要求する呼出しclientと接続診断を追加した。応答は32 KiB、90秒で打ち切り、未知eventを拒否する。
- 固定commit上で`npm run verify`を実行し、TypeScript、Jest 4 suite／10 test、ESLint、offline manifest source検査を合格した。結果は`docs/evidence/local-ai-source-validation-20260915.json`へ記録した。
- `scripts/stage-local-ai-apk.py`はAPKのlock、ZIP安全性、package/version、arm64 native library、`INTERNET`権限なしを検査し、`vendor/rockstaros-local-ai`へSoong moduleを生成する。現在のartifact lockは`APK_NOT_BUILT`なので、未知APKはstageできない。
- 物理OS build入口はレビュー済みAPKと`aapt2`を必須入力にし、repo全体のrevision検査後にもstaged APKを再照合する。product makefileもstageがなければbuildを拒否する。
- 固定SHAの`local-ai-overlay.patch`に、署名Binder service、React Native native module、Headless JS推論、stream、cancel、proposalの一時保存と別確認を実装した。`prepare-local-ai-runtime.py`はcleanな固定commitから使い捨てbuild treeを生成し、overlay hashと適用可否を確認する。
- 生成したclean overlay treeでclient/server AIDLのbyte一致、TypeScript、ESLint、Jest 10件を合格した。Kotlin／APKのnative buildは未実施。
- `.github/workflows/local-ai-apk.yml`はUbuntu、Java、Android SDK 36、NDK 27.1で固定sourceとoverlayからunsigned arm64 APKをbuildし、package/version、通信権限、ABIを検査した7日間の候補artifactを出力する。workflowの存在はbuild成功証拠ではなく、artifact lockを自動更新しない。
- product propertyは`source-pinned`とだけ表示する。アプリを`PRODUCT_PACKAGES`へ追加していないため、現在のimageにLLMは入らない。

## OS内で呼び出せるようにする残作業

1. Java 17とAndroid SDK/NDKがあるLinux環境で`build-local-ai-apk.sh`を実行し、今回のKotlin serviceを含むunsigned arm64 release APKをnative compileする。
2. 生成APKを別経路で検査してartifact lockへSHA-256とsizeを固定する。debug鍵は採用しない。
3. staging済みAPKはSoongで`testkey`署名対象とし、production target-filesでは正式release keyへ置換する。鍵生成・release署名は別gateとする。
4. GGUFはライセンス、SHA-256、RAM/温度/速度を端末で確認してからimportする。source repositoryにはweightを同梱しない。
5. airplane mode推論、tool confirmation、SELinux、更新、rollback、30分連続稼働を実機で受け入れる。

対象Pixelの機種/SKUが未確定で、x86_64 Linux build環境、正式署名鍵、GGUFも未用意のため、全OS build・flash・実機推論は未実施のまま維持する。
