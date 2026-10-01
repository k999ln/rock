> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# Rock Wallet ローカルシミュレーター

このモジュールは **1 個のテスト用ウォレット**で、精算・月額利用料・引出し保留・現金結果の照合を試すためのものです。残高と取引はすべて架空の USD セントです。実資金、暗号資産、鍵生成、外部 API、ATM 通信、送金、決済事業者への請求は実装していません。

本人と対象端末は `TEST_FIXTURE_OWNER_NOT_IDENTITY_VERIFIED` および `TEST_FIXTURE_ELIGIBLE_DEVICE_NOT_ATTESTED` という明示的なテスト fixture です。本人確認、端末の購入資格確認、passkey、WebAuthn、認証済み権限を実装した意味ではありません。UI 操作による同意を passkey 承認と呼んではいけません。テナント分離や本番向けウォレットは未実装です。

## 保存と金額

`Wallet(db_path)` は標準ライブラリの SQLite を使います。金額は Python の整数と SQLite INTEGER に限定し、浮動小数点・文字列・boolean を拒否します。1 操作の上限は `100,000,000` セントです。ゼロは現金の結果照合にのみ許可します。

各金額変更は、同一 journal に最低 2 件の符号付き posting を保存します。合計は必ずゼロです。`AVAILABLE`、`PENDING_SETTLEMENT`、`WITHDRAW_HOLD`、`CASH_DISPENSED`、`SERVICE_FEES` はマイナスにならず、架空売上の相手勘定 `SALE_CLEARING` が反対側を持ちます。journal と posting は更新・削除を拒否し、訂正は追加の journal で行います。これはローカルの記帳規約であり、本番会計基準への適合や管理者による DB 改ざん防止を保証しません。

変更は `BEGIN IMMEDIATE` から commit まで同一トランザクションで処理します。複数インスタンスやスレッドによる課金と引出しも SQLite の書込みロックで直列化され、残高検査と記帳の間に割り込みません。journal の釣合い、勘定の非負、取引記録と残高の一致を commit 前に確認します。読み取りは一貫したトランザクションの snapshot を返します。

## 操作

| メソッド | 結果 |
| --- | --- |
| `simulate_sale(amount_minor, idempotency_key)` | `PENDING_SETTLEMENT` に架空売上を記帳。課金・引出しには使えません。 |
| `settle_sale(sale_id, event_key)` | 精算完了を模擬し `PENDING_SETTLEMENT` から `AVAILABLE` に移します。 |
| `consent_monthly(accepted)` | boolean による同意または撤回を、日時・規約版・888 セント・fixture 識別子とともに追記します。 |
| `bill(period, idempotency_key)` | 最新の明示同意がある場合に、`AVAILABLE` から月額 **888 セント**を記帳します。`period` は `YYYY-MM`。 |
| `reserve(amount_minor, idempotency_key)` | `AVAILABLE` から `WITHDRAW_HOLD` に予約額を移します。 |
| `dispense(withdrawal_id, dispensed_minor, event_key)` | **累計**の現金額を記録。前回との差額だけを hold から `CASH_DISPENSED` に移します。 |
| `mark_unknown(withdrawal_id)` | 結果不明を記録。保留額と既知の現金額を維持します。 |
| `reconcile(withdrawal_id, total_dispensed_minor, event_key)` | 模擬的な最終照会として累計現金額を確定し、未払出し分の hold を返還します。 |
| `snapshot()` | 残高、同意、売上、引出し、月次請求、journal を JSON 互換 dict として返します。 |

金額操作のキーは 1〜160 文字で、全操作を通じて共通の名前空間です。同じキー・操作・内容の再試行は最初に保存したレスポンスを返します。**レスポンスはその時点の記録**なので、最新状態は `snapshot()` で確認します。同じキーを別内容や別操作に転用すると `IdempotencyConflict` で拒否します。失敗した操作は記帳・キー保存の両方を rollback するため、条件を満たした後の再試行が可能です。

月次利用料は DB の `period` 一意制約で同じ月につき一回に限定します。別キーによる同じ月の再依頼も追加課金しません。同意撤回後の新しい月は拒否されますが、過去に完了した月の再照会は既存結果を返します。自動スケジューラー、現在月の判定、解約日の日割り、税、請求書、返金は未実装です。

## 部分払出しと復旧

1. `3,000` セントを予約すると、全額を hold します。
2. `dispense(..., 1_000, ...)` は `1,000` セントの現金を記録し、`2,000` セントの hold を残します。状態は `AWAITING_RECONCILIATION` です。
3. 通信結果不明を模擬する `mark_unknown(...)` を呼んでも残額は戻りません。再起動後も `UNKNOWN` と hold が残ります。
4. `reconcile(..., 1_200, ...)` で最終累計が確定すると、追加 `200` セントの現金と `1,800` セントの返還をそれぞれ記帳し、`PARTIAL_REVERSED` になります。

最終累計ゼロなら全額返還して `REVERSED`、予約全額なら `DISPENSED` になります。過去の観測額より小さい累計、予約より大きい累計、確定後の異なる累計は拒否します。同じ最終結果の再通知は二重返還しません。実 ATM の証拠確認はありません。`reconcile` の入力は人が与えるテスト上の事実であり、本番で自由入力を信頼してはいけません。

## ローカル実行例

```python
from blackberryrock.wallet import Wallet

wallet = Wallet("work/demo-wallet.sqlite3")
sale = wallet.simulate_sale(5000, "demo:sale:1")
wallet.settle_sale(sale["id"], "demo:settlement:1")
wallet.consent_monthly(True)
wallet.bill("2026-09", "demo:monthly:2026-09")
withdrawal = wallet.reserve(3000, "demo:withdrawal:1")
wallet.dispense(withdrawal["id"], 1000, "demo:cash:1")
wallet.mark_unknown(withdrawal["id"])
wallet = Wallet("work/demo-wallet.sqlite3")
wallet.reconcile(withdrawal["id"], 1200, "demo:reconcile:1")
assert wallet.snapshot()["available_minor"] == 2912
```

モジュール単体にはユーザー認証がありません。HTTP 経由で接続する呼出し元は loopback 制限と既存の認証を維持し、`simulation_only` と fixture の性質を UI に表示する必要があります。モジュールから外部へアクセスする処理はありません。

## 検証

```sh
PYTHONPATH=src python3 -m unittest discover -s tests -p test_wallet.py -v
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

テストは、未精算残高の利用拒否、同意なし・撤回後の課金拒否、月額の重複防止、キー衝突、整数と上限検査、部分払出しと返還、結果不明からの再起動復旧、同時課金と引出しの競合、同月への同時課金、記帳直後の例外 rollback、未 commit の子プロセス異常終了からの復旧、journal の変更拒否を確認します。
