# RockstarOSのPixel表示更新

本人指定の紺色6輪＋中央円の会社ロゴを、RockstarOS・smis・Eve・Mini/ProのWeb/PWAとAndroidのランチャー・共通ヘッダーへ揃える。原画像は`public/brand/rockstaros-logo-source.png`、共通仕様は`data/company-brand.json`。`node scripts/build-company-brand.mjs`で原画の中央1080角から比率を保って192/512画像とSVG容器を再生成する。`avokado-metallic-mark.png`は互換URLとして残るが中身は新ロゴ。絵柄は描き替えない。生成物のhashは`data/company-brand-assets.json`を参照する。旧bootanimation zip・既存導入APKの表示を更新済みとはしない。

現在の再設計が正本。旧Buildroot/QEMUを完成させる作業へ戻さず、利用可能なコードだけを選択再利用する。四端末の役割・同一契約の基本料重複防止・相棒の独立警報は[共通適応契約](../../docs/device-support-architecture.md#current-device-adaptation)を参照。

## 再現と保全

現在のAndroid開発checkoutを読み、**新しい専用フォルダー**へコピーする。元checkoutは変更しない。対応するcontractsもコピーし、画面/アイコンresourceと既定無効のservice-setupだけを追加する。

```sh
python3 scripts/stage-pixel-branding.py --android-source /absolute/current/android --output work/brand-review/android
```

既存の公式SDK35/JDK17/Gradle8.11.1で`:shell:assembleDebug :shell:assembleDebugAndroidTest :shell:testDebugUnitTest :shell:lintDebug :shell:compileReleaseJavaWithJavac`を実行する。sourceと全生成物は合格した同じ候補のhashを固定する。実機更新前にPixel 10 GL066/frankel、インストール済みAPK hash、旧APKと新APKの署名一致、保存DBのhashを確認する。署名鍵を新規生成しない。`adb install -r`後に候補と実機hashを照合し、`PixelBrandingAcceptanceTest`だけを選んで名前、会社ロゴ、4ページ、service-setup無効を確認する。実profile・支払・jobを作らない。

このUI-only試験は既存viewの検査で、ロック解除やスクリーンの目視合格を代替しない。ロック中は本人の解除後に表示確認する。秘密のPINを取得しない。Broker DB/WAL、boot lock/stateの前後比較を保存し、本人の仕事/設定を保持する。失敗時は保全した同署名の旧Shell APKへ戻し、データを消して直さない。

## eSIMとOS起動表示の境界

eSIM直接追加はsystem permissionまたはcarrier privilegeを確認した場合だけ要求する。通常Shellはこれらの権限を要求せず、権限がない場合はAndroid/発行元の設定へ案内する。ローカルの追加結果と真正なissuer/端末導入証拠は別。OS受入前のservice-setupはresourceで無効、実請求/契約/環境開始はしない。

`os/physical/branding/bootanimation.zip`はAndroid OS候補向けの準備物で、現在のPixelのboot画面に未適用。Mini/Pro/相棒は各表示/物理マークadapterを別受入し、Android用zipやPixel binaryを転用しない。全OS build/flash/正式署名/Provider/課金の完成へ、このAPK受入を転用しない。

## フロントの構図を反映する場合

`--frontend`をstageコマンドへ加えると、ブランド適用後に`pixel-frontend.patch`を適用する。現在の実行機能を持つAndroid sourceを使い、元checkoutは変更しない。旧名Eve統一・現在の実行先要約・詳細折りたたみ・主確認操作・共通geometryだけの変更。パッチの文脈が違えば停止してreviewする。前APKを残し、同じ署名・Broker保存不変・実画面を別受入する。統計的な好みの優越は未検証。
