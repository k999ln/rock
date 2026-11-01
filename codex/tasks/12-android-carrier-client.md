# 12 Android: carrier privileges を使う RockstarOS client と Play 自動導入

前提: task 10 で ARF 対応 provider が決まり、契約済み。それまでは**設計と雛形だけ**作る。

## やること
1. `android/rockstaros-client/`（新規、または android/core を流用）: 署名証明書の SHA-256 を provider に渡す手順を README に。`TelephonyManager.hasCarrierPrivileges()` が true のときだけ有効になる機能: APN 設定、`EuiccManager` で profile の切替・削除、回線状態の取得。
2. 起動時フロー: SIM 検出 → carrier privileges 確認 → account ログイン（既存 Pixel 用 attestation と同じ entitlement API）→ Eve 画面。
3. Google carrier partner 申請に要る資料（アプリ ID、署名証明書、MCC/MNC、サポート窓口）を `docs/esim/google-carrier-partner-checklist.md` に。
4. 既存 GrapheneOS 系 native RockstarOS（docs/native-os-integration.md）との関係を 1 表に: 「普通の Android ＋ carrier app」と「native RockstarOS」は同じ account・同じ entitlement API を使う、違いは OS の深さだけ。

## 合格条件
- エミュレータで `hasCarrierPrivileges()` をモックしたテストが通る。
- checklist が本人の申請に使える状態。

## やらないこと
- Play への公開。自社 SM-DP+ の運用。
