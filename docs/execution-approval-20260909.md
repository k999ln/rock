# Rock — 実装承認と条件付きの公開・実機・実資金希望

記録日時: 2026-09-09T17:47:40.214265+00:00。利用者発言の正確な時刻を示すものではない。

設計v1.1を提示した後、利用者から「実装できるところまで整ってるなら公開していい」「実機もある」「metamaskで送金や受け取りができるなら実資金で試してもいい」と返答を受けた。これを実装開始の承認と、準備が整った対象の公開・実機導入・実資金試験への条件付き了承として記録する。実装の再承認は求めない。

承認対象: 設計v1.1、commit `27b34adc02a9e06a4816aa18a5e38cf38b330953`、元文書SHA-256 `8daaf9d5109ce7e3d347e0166ec005c00ec4196c1b8b47d0c840d77a9765304e`。製品ベースv1.6/RQ01〜RQ15を維持。任意Game入口を含む提示範囲で進め、達成演出は見送る。

main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、設計 `27b34adc02a9e06a4816aa18a5e38cf38b330953` を専用cloneへ取得。既存作業木は変更しない。実装branchは `codex/operational-base-20260909`。機械可読記録は `data/execution-approval.json`。

実装順: 専用Linux環境で統合source回帰→V01起動基礎→既存native商品と合成Wallet→D0〜D6受入。ALIGN03のbackup試験入口とN02起動応答を修正。B03-FIXTURE後にGX00→GX01→DX01。公開/実機/MetaMask実資金は条件付き了承を保持し、対象と技術条件を確認する。

公開対象（OS開発版/Web）は説明中。利用者の実機はPixel 10 / GrapheneOS、BlackBerryは注文中で型番未指定。GrapheneOSを保ったAndroid P1 APK試用を別トラックで確認する。QEMU用ARM64 virt imageは機種対応imageではない。SSDや既存VMを転用せず、新しい使い捨てLinux環境を準備する。

MetaMaskは現コードでアドレス接続のみ。チェーン・残高・送信・受取確認の実装と試験がまだなく、native USD cents simulatorへの資金接続もない。実資金のチェーン/資産/宛先/額/手数料条件は未指定。実送金や公開済みという意味に置き換えない。秘密鍵・復旧フレーズを受け取らず、本人のWalletで内容を確認する導線を使う。

予測市場・ゲーム資産売買、料金変更、main merge、force pushへの拡張は行わない。ATM自社手数料0と同契約月888 centsを維持。これは承認記録であり、OS受入合格・実機対応・実資金試験結果ではない。
