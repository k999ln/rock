# 13 iOS: universal link 導入と Eve の PWA 起動

## やること
1. `/connect` の iOS 分岐: `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$<smdp>$<matchingId>` を生成（iOS 17.4+）。17.4 未満は QR 表示にフォールバック。
2. 導入後の戻り先: Safari の `/connect/done` → 「ホーム画面に追加」の案内（PWA, app/manifest.ts を Eve 用に整える: name "Eve", short_name "Eve", icons）。App Store 版は後。
3. 導入確認: iOS は EID を Web に渡せないので、account 側で「導入宣言」ボタン＋provider webhook（profile downloaded）の照合で entitlement を active に。lib/esim-install-proof の既存ロジックを使う。
4. Apple carrier entitlement（CTCellularPlanProvisioning）が要る機能の一覧と、無くても成立する機能の一覧を `docs/esim/ios-capabilities.md` に。

## 合格条件
- iPhone 実機で universal link からの導入 → /connect/done → Eve PWA 起動、まで確認し CHANGELOG に記録。

## やらないこと
- App Store 提出。
