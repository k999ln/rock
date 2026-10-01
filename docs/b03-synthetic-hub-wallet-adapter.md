# B03 段1〜2 合成 Hub↔Wallet adapter 設計

- 状態: **design draft / 未実装**
- 作成時点の参照SHA（snapshot。読者は最新refを再確認すること）:
  - `main`: `9f4930b45e2d`
  - `codex/rockstaros-launch-candidate-20260910`: `fe81c05aaa4b`
- 範囲: **合成のみ**（段3 provider sandbox / 段4 認証済み実取引は対象外）
- 不変条件:
  - 同一契約の月額 **888 USD cents** を変更しない
  - Rock ATM 自社手数料 **0** を変更しない
  - 作者APIに実価値mint権限を与えない
  - 実資金操作・課金・外部送信は所有者の明示承認があるまで行わない
  - `realValueEnabled=false` を維持する。合成合格を実資金準備完了と呼ばない

関連: [次の実行プロンプト](prompts/hub-wallet-next.md) 段階3（GAP03 / B03）、[製品ベース](product-baseline.md) RQ05〜RQ06 / RQ08。

## 0. 目的と非目的

**目的:** Hubの仕事 / Run / execution receipt と、既存の個人Wallet台帳を **明示的な金融イベント** で結び、費用・売上・照合状態を追跡可能にする。

**非目的:**

- Hub成功件数の自動売上化
- 新料金・新手数料、または月額888の変更
- ToB `os/settlement` と個人Walletの接続（現状の `personal_wallet_link=NOT_CONNECTED` を維持）
- Game交換契約（Game担当）および接続transport実装（接続担当）
- AI compute予算（micro-USD / `simulation_only`）をWallet科目へ混在させること
- 実provider・実資金・KYC・本番ATM

## 1. 再利用する既存物

| 既存 | 使う理由 |
| --- | --- |
| `blackberryrock.wallet` の `simulate_sale` / `settle_sale` / `bill`(888) / journal | 第二の個人残高正本を作らない |
| `entitlement.WalletBridge` | 月額課金経路の専任。本adapterは月額を再実装しない |
| runner `rock-runner/1` の不変 submit receipt | 相関の一次入力 |
| ToB settlement の原則（Tool/MCP成功だけでは入金しない） | 同じ原則をHub側へ適用 |
| FENCE / managed admission | 書込みは既存のadmit経路のみ |

## 2. コンポーネント案（将来実装。本文書は設計のみ）

配置案: `systems/rock-star-os/os/hub_wallet_adapter/`

### 2.1 `HubFinancialEvent`（署名付き合成envelope）

必須フィールド:

- `v`, `authority_id`, `owner_id`, `device_id`, `event_id`, `kind`
- `currency` = `USD`
- `amount_minor`（整数セント）
- `occurred_at`
- `links`（`package_id?`, `job_id?`, `run_key?`, `receipt_sha256?`, `period?`）
- `simulation_only` = `true`（必須）
- `funds_owner`（後述）

拒否:

- float / 別通貨 / `simulation_only=false`
- リクエスト本文の自己申告だけで他人のWalletを選ぶこと

### 2.2 `CorrelationStore`（Walletとは別DB）

event と Wallet posting / `sale_id` / `bill_id` の対応と状態だけを保持する。**残高の正本にしない。**

### 2.3 `HubWalletAdapter`

認証済みeventだけを受け、既存 `Wallet` APIへ高々1回作用する。横断2DBは `WalletBridge` と同様 **非atomic** とし、中断時は同一idempotency keyで復旧する（自動再post禁止）。

## 3. `kind` と Wallet作用

| kind | 意味 | Wallet作用 | 備考 |
| --- | --- | --- | --- |
| `exec_cost_accrued` | 実行費用の確定（合成） | 記録。Rock月額以外を `SERVICE_FEES` に混在させない | 現状 `packages.py` は USD 0/run。額0を正規経路とする。非0は `FIXTURE_NONZERO_COST` 明示ラベル必須。catalog価格と矛盾したら拒否 |
| `sale_pending` | 未確定売上（合成） | `simulate_sale` | Hub `succeeded` からは生成しない |
| `sale_settled` | 確定売上（合成） | `settle_sale` | 先行pending必須。金額・owner不一致は拒否 |
| `manual_unmatched` | 手入力 / 未照合 | postingなし。Correlationのみ `UNMATCHED` | UIは未照合と表示 |
| `rock_monthly` | 月額888 | **本adapterでは拒否** | `WalletBridge` 専任。二重課金防止 |

## 4. 状態機械

`RECEIVED → ACCEPTED → POSTED → (RECONCILED | REJECTED)`

割込: `UNKNOWN`（Wallet側の成功が不明）。`UNKNOWN` では自動再postしない。同一 `event_id` と同一payloadのstatus照会のみ許可する。

不変条件:

- 同一 `event_id` のpayload変更 → Conflict
- 同一business key（owner + kind + links + amount）の別 `event_id` 再送 → 再計上拒否
- job成功だけのevent → 拒否
- `receipt_sha256` がある場合、runner/Hub側の不変receiptと不一致 → 拒否

## 5. 所有者分離（`funds_owner`）

| 値 | 本adapter |
| --- | --- |
| `user_work` | 許可（利用者の仕事収益） |
| `tob_product` | 拒否（ToB settlementへ） |
| `rock_service` | 拒否（月額は `WalletBridge` 専任） |

## 6. 段1 / 段2の合格証拠（実装時）

**段1（host）:** idempotency、settle先行拒否、job成功のみ拒否、0円cost受理、非0はfixtureラベル、`WalletBridge` 月額との非干渉、`simulation_only` 欠落拒否。

**段2（QEMU合成縦断）:** 既存商品1件をHub実行 → cost event（0可）がCorrelationに残る → 別途fixtureの `sale_pending` / `sale_settled` でWallet残高が変化 → UIが `simulation_only` / 未照合 / 確定を区別。証拠に **成功件数 ≠ 売上** を明記する。

環境ラベル: `host` / `fixture` / `QEMU guest` を分け、段3 sandbox・段4実取引の証拠欄と混ぜない。

## 7. B02依存

`packages.py` の `price.amount_minor == 0` は維持する。非0のcatalog接続はB02。本設計は0円経路で段1〜2を先に閉じ、非0はfixture試験に限定する。

## 8. Release / 証拠の衛生

- Developer Preview主張の上限は合成（host/fixture/QEMU・`simulation_only`）まで
- 実資金ゲート未達のまま本番ローンチ不可・実資金試験を開始しない
- B03を done にしない（本文書の保存 ≠ 実装完了 ≠ GAP03解消）

## 9. 未解決

- 実行費用用の新しいWallet科目が必要か（`SERVICE_FEES` 汚染禁止のため要判断）
- 非0 fixtureの金額セット
- 実装着手・段3/4・実資金は別承認

---

### 出力区分（このcommit時点）

- **事実:** 本ファイルは設計草案の文書化である。adapter実装コードは含まない。
- **変更:** `docs/b03-synthetic-hub-wallet-adapter.md` の追加。
- **検証証拠:** なし（設計のみ）。
- **承認待ち:** 実装着手、段3 sandbox、段4実取引、実資金。
- **未解決:** 実行費用科目、B02非0価格、B03全体の完了。
