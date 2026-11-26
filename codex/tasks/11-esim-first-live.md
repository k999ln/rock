# 11 eSIMの初回利用 — 発行・端末での開通・利用権の照合

目的: 回線の発行・導入確認をsandboxで検証し、実機では本人の専用eSIM経由に限ってRockstarOSのパッケージを利用できることを確認する。

2026-11-22 の通し設計は[eSIMから最初の仕事まで](../../docs/structure/03-esim.md#esimから最初の仕事まで)。本タスクは回線・端末・利用権を照合してEve／Noahへ引き渡すところまで。Noahでの実行・利用明細は、本人が仕事と予算を承認した後に task 75・92・94 の受入へつなぐ。

模擬専用回線での配送先登録、入荷・定期配給、Agentの接続先切替・バックグラウンド実行・結果受取の試験は[運営Dockから本人受取までの開発指示](../../docs/prompts/noah-esim-free-device-trial-20261122.md)を参照。

> **2026-11-21 の決め（[03 の 0 章](../../docs/structure/03-esim.md)・[07](../../docs/structure/07-decisions-from-minutes.md)）。** スマホは型 S（今の回線の横に入る 2 本目、SMS なし）。2026-11-22 に利用者から月額は取らない形へ変わったので、月額の Stripe の流れ（下の 2・4）は、本人が有料を決めるまで作らない。続けて使う割合は task 103 で比べる。

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


2026-11-22 Noah実機受入と回線準備（PR #377）: PixelのブラウザからAgentboardへ登録・認証付き実行・成果再表示を確認した。Wi-Fi経由であり実eSIMの受入ではない。最新main 97898c519にある専用クラウドの2試験はローカル合成LINEで再成功。公開env16に事業者設定はなく、実回線照合器も未設定。[導入候補・費用・事業者への確認文案](../../docs/esim/noah-pilot-rfq.md)を作成。本人の費用確認、発行承認、実回線経由のPixel疎通が次の前提。
2026-11-27 登録情報再利用の同意説明（[PR #96](https://github.com/iceiceice999/rock/pull/96)、未公開）: eSIM案内・プロフィール保存・Agent登録で共通の同意説明を6言語で表示する。任意の保存・再利用、送信先/目的/項目の確認、停止/削除、Apple・Googleの認証情報やSIM秘密鍵を他Agentへ渡さない範囲を案内する。現行同意版の記録がないプロフィールは外部Agent登録で自動再利用せず、登録情報画面で再同意する。実eSIM契約・発行・クラウド接続・OAuth直接取込みは未受入。
