# 11 eSIM 初回稼働 — esim-go sandbox で一周 → Stripe 月額

目的: provider 契約を待たずに「eSIM を入れる → Eve が開く → account 束縛 → 月額」を今の部品で動かす。

模擬専用回線での配送先登録、入荷・定期配給、Agentの接続先切替・バックグラウンド実行・結果受取の試験は[運営Dockから本人受取までの開発指示](../../docs/prompts/noah-esim-free-device-trial-20261122.md)を参照。

## 現行コード
app/api/esim/**（catalog, order, issue, qr, install-proof, device-entitlement, reconcile, webhook）、lib/esim-*.ts、lib/esimgo-provider.ts、app/connect、components/esim-purchase-setup.tsx、components/rockstar-service-setup.tsx、lib/rockstar-entitlement-*.ts、services/sky-billing。

## やること
1. **provider 境界を切り直す**: `lib/esim/providers/types.ts`（issueProfile, getActivationCode, revoke, onWebhook）と `lib/esim/providers/esimgo.ts`（既存 lib/esimgo-provider.ts を移す）。将来の `iij.ts` 等が同じ型を実装する。
2. `/connect` の流れを 4 段に固定: ①account ログイン ②月額同意（Stripe Checkout, subscription）③eSIM 発行（QR と iOS universal link の両方を表示）④導入確認 → EID/ICCID を entitlement に束縛 → Eve（/chat）へ遷移。
3. 文言から「データ」「GB」「残量」を消す。表示は「RockstarOS 回線」「月額」。
4. Stripe: subscription の `invoice.payment_failed` → entitlement を `suspended`、`invoice.paid` → `active`。provider の回線停止 API は adapter の `suspend/resume` に抽象化（esim-go で未対応なら no-op＋ログ）。
5. tests/esim-connect-flow.test.mjs: ①〜④を sandbox モックで一周。
6. docs/structure/03-esim.md §4 の表を実装後の状態に更新。

## 合格条件
- 自分のスマホ（iOS と Android 各 1 台）で、QR / universal link から導入 → Eve が開く、まで実機確認し、CHANGELOG に記録。
- Stripe テストモードで payment_failed → suspended が動く。

## やらないこと
- 自社証明書の ARF 埋め込み（provider 契約後の task 12）。本番 Stripe 鍵の投入。


2026-11-22 Noah実機受入と回線準備（PR #377）: PixelのブラウザからAgentboardへ登録・認証付き実行・成果再表示を確認した。Wi-Fi経由であり実eSIMの受入ではない。最新main 97898c519にある専用クラウドの2試験はローカル合成LINEで再成功。公開env16に事業者設定はなく、実回線照合器も未設定。[導入候補・費用・事業者への確認文案](../../docs/esim/noah-pilot-rfq.md)を作成。本人の費用確認、発行承認、実回線経由のPixel疎通が次の前提。
