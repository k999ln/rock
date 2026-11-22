# 11 eSIMの初回利用 — 発行・端末での開通・利用権の照合

目的: 回線の発行・導入確認をsandboxで検証し、実機では本人の専用eSIM経由に限ってRockstarOSのパッケージを利用できることを確認する。

2026-11-22 の通し設計は[eSIMから最初の仕事まで](../../docs/structure/03-esim.md#esimから最初の仕事まで)。本タスクは回線・端末・利用権を照合してEve／Noahへ引き渡すところまで。Noahでの実行・利用明細は、本人が仕事と予算を承認した後に task 75・92・94 の受入へつなぐ。

模擬専用回線での配送先登録、入荷・定期配給、Agentの接続先切替・バックグラウンド実行・結果受取の試験は[運営Dockから本人受取までの開発指示](../../docs/prompts/noah-esim-free-device-trial-20261122.md)を参照。

## 現行コード
app/api/esim/**（catalog, order, issue, qr, install-proof, device-entitlement, reconcile, webhook）、lib/esim-*.ts、lib/esimgo-provider.ts、app/connect、components/esim-purchase-setup.tsx、components/rockstar-service-setup.tsx、lib/rockstar-entitlement-*.ts、services/sky-billing。

## やること
1. **provider 境界を切り直す**: `lib/esim/providers/types.ts`（issueProfile, getActivationCode, revoke, onWebhook）と `lib/esim/providers/esimgo.ts`（既存 lib/esimgo-provider.ts を移す）。将来の `iij.ts` 等が同じ型を実装する。
2. `/connect` で①本人のログイン、②回線料金への同意、③eSIM発行と設定の案内、④登録端末・本人の利用権と実際の接続回線の照合を順に行う。専用回線でパッケージ選択へ進む。別回線から戻った場合は接続方法を表示する。
3. 文言から「データ」「GB」「残量」を消す。表示は「RockstarOS 回線」「月額」。
4. Stripe: subscription の `invoice.payment_failed` → entitlement を `suspended`、`invoice.paid` → `active`。provider の回線停止 API は adapter の `suspend/resume` に抽象化（esim-go で未対応なら no-op＋ログ）。
5. tests/esim-connect-flow.test.mjs: ①〜④を sandbox モックで一周。
6. docs/structure/03-esim.md §4 の表を実装後の状態に更新。

## 合格条件
- iPhoneとAndroid各1台で専用eSIMを追加し、通常アプリがWi-Fiを使う場合、主SIMを使う場合の両方で試す。手動切替なしでRockstarOSだけが本人の専用回線を経由したことを事業者側で照合し、パッケージ開始と成果取得を確認する。専用eSIMを無効にしたときは通常アプリの通信が続き、同じログインでもサービスのAPIと成果URLから成功する操作・取得は0件。別の人の専用eSIM、利用権失効、回線の照合不能の場合も拒否する。専用回線の復帰時に予約の二重実行が0件であること、必要だった追加アプリや管理設定も記録する。[端末別の検証条件](../../docs/structure/03-esim.md#普段の回線を変えずに使う条件)
- Stripe テストモードで payment_failed → suspended が動く。

## やらないこと
- 自社証明書の ARF 埋め込み（provider 契約後の task 12）。本番 Stripe 鍵の投入。
