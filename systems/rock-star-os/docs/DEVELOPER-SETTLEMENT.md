> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# 開発者の売上精算・出金予約（公開シミュレーター）

この実装は ToB の開発者売上に対する独立台帳である。認証済み provider event の売上・精算を受け、利用可能額を出金予約し、provider 結果を照合する。**実資金、銀行口座、Stripe 契約、本人確認、実 provider は未接続**。OS への組込み・GUI 操作の実証ではなく、ホスト上の実 HTTP と SQLite による境界検証である。

個人向け標準 Wallet、月額 USD 8.88、ATM 保留、既存の購入者 authority は変更しない。個人 Wallet のデータを開発者ごとに複製しない。`blackberryrock.wallet` と同じ BEGIN IMMEDIATE・均衡する追記型 posting・不変 receipt の設計を用いるが、会計科目も DB も別である。将来の Wallet 接続は、認証済み精算イベントと相手台帳の不変 receipt を照合する専用 adapter が必要であり、現在 `personal_wallet_link=NOT_CONNECTED` と返す。

## 認証と金額

`SettlementStore(directory, authority_id=..., bindings={developer_id: provider_account}, identity=..., provider=...)` は、私有 0700 ディレクトリと単一プロセス所有 lock、0600 SQLite を用いる。provider・identity adapter は省略すると拒否する。固定 authority、developer/account 対応、provider endpoint/契約の digest を永続化し、再起動時の構成消失・付替え・不完全 mode は拒否する。既存 lock や他の state が残っているのに DB が欠損した場合も、空台帳を作り直さず回復を要求する。既存台帳への自動移行・口座追加・生きた DB の複製は未対応。

公開 `FixtureIdentity` は既存 Alice/Bob fixture token を別々の developer に対応させる。`FixtureProviderTransport` は明示 `allow_public_fixture=True` と `http://127.0.0.1:<port>` だけを受ける。HMAC-SHA256 は既存の `entitlement.protocol.PUBLIC_TOKENS['wallet']` を新しい domain で分離して使う。署名検証は実処理だが、鍵は既知の公開試験文字列なので本物の本人確認・署名秘密・provider 認証を主張しない。新鍵は生成しない。

署名 event は `authority_id / provider_id / developer_id / provider_account / event_id / kind / currency / record` 全体を結ぶ。USD の整数セントだけを受け、bool・浮動小数・負数・別通貨・上限外を拒否する。売上では authoritative `gross_minor = fee_minor + net_minor` を厳密に要求し、手取り額のみを台帳へ計上する。手数料率を推定しない。1 セントも整数のまま扱い、端数丸めをしない。出金は今回の fixture 契約が明示する `fee_minor=0` だけを扱う。別の出金手数料には、新しい署名済み見積・同意契約が必要である。

## 永続状態と API

| 操作 | 確認と結果 |
|---|---|
| `ingest(envelope)` / `kind=sale` | 署名と全 identity/金額を検査し、SALE_CLEARING → PENDING。Tool 成功や MCP の相関 ID だけでは入金しない。 |
| `ingest(envelope)` / `kind=settled` | 既存 sale の developer・gross/fee/net が一致する場合だけ PENDING → AVAILABLE。順不同で settlement が先に来た場合は拒否し、sale 到着後の再配送を受ける。 |
| `reserve(amount, key=..., auth=...)` | 現在の eligibility と接続を確認し、AVAILABLE → PAYOUT_HOLD を receipt と同一 transaction で保存。返すのは予約時の receipt であり送金成功ではない。 |
| `process_one()` | eligibility → store lock → SQLite の順で開始を再確認し、送信 claim を commit。その後だけ provider の create を呼ぶ。 |
| `status(key, auth=...)` | 認証された当該 developer の現在状態を返す。履歴 receipt の予約時状態とは区別する。 |
| `cancel(payout_key, key=..., auth=...)` | 未 claim だけを取消し AVAILABLE に戻す。claim 後は不明であっても取消による解放を拒否する。 |
| `disconnect(key=..., auth=...)` | 新しい予約・未 claim の開始を止める。保留・元 provider binding・照合を保持する。外部 credential の失効を実施したとは表示しない。 |

各 event ID と developer ごとの business key は exact payload を持つ不変 receipt を返し、異なる payload の再使用は拒否する。別 event ID で同じ sale/settlement が届いても再計上しない。business key は authority と developer にも結び付ける。複数 developer の残高・照合・取消を混ぜない。単一 DB 内で予約を直列化し、同時に残高を使い切ろうとする要求の二重承認を防ぐ。

claim 後の通信切断、返信欠落、結果保存失敗、再起動は `UNKNOWN` と保留を維持する。**create を自動再送せず、元の business key と金額を使う別の read-only status 操作だけで照合する**。claim と HTTP の間で停止し、provider が `not_found` を返しても再送・解放しない。これは二重支払いを避ける代わりに、管理者による将来の明示的な照合手続が必要になる境界である。

署名された完全な `paid` 結果だけが PAYOUT_HOLD → PAID、明確な `failed_no_transfer` だけが PAYOUT_HOLD → AVAILABLE になる。未確定・改ざん・金額違い・別口座の結果は保留する。接続解除や developer の新規出金 eligibility 喪失後も、既に claim した結果の照合は維持する。送信 claim 後、実 HTTP 直前の解除で外部送信を必ず止めるとは主張しない。

今回は provider fixture の終端結果が不変である契約に限定する。実 provider の後日返金・dispute・payout reversal、部分送金、為替、税務、実 KYC/AML・契約審査・銀行設定・失効情報同期・分散 writer は未実装。PAID 後の矛盾する終端通知を自動で資金へ戻さず、明示的な回復が必要な矛盾として拒否する。単一 Store を経由しない外部 SQL 書込みは非対応。

## 試験

`PYTHONPATH=src:os:tests python3 -B -W error::ResourceWarning -m unittest test_developer_settlement -v`

実 loopback HTTP 上の署名イベント取得、実 SQLite posting/receipt、provider の結果 commit 後の半返信切断、再起動・解除後の status-only 照合、同時残高予約・同一 key、developer 分離、1 セント、手数料内訳、負数・別通貨・改ざん、SQLite trigger による claim 前/結果保存時の実書込み拒否を検証する。trigger は私有試験 DB への明示的な故障注入であり、本物の容量不足・OS 電源断とは主張しない。provider の送金結果は公開 fixture のシミュレーションであり、外部入金の証拠ではない。試験数・原本ログは最終 evidence report を参照する。

## 一次資料と未接続範囲（2026-09-08 確認）

- [Stripe Connect account balances](https://docs.stripe.com/connect/account-balances): pending と available を区別する設計の参考。こちらのネット売上イベントは独自 fixture 契約であり、Stripe balance event の実 adapter ではない。
- [Stripe webhook endpoints](https://docs.stripe.com/webhooks): 受信署名の検証、重複通知・順不同を前提とした処理の参考。Stripe-Signature の verifier や実 endpoint secret は導入していない。
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests): 同 key の再試行とパラメーター一致の参考。こちらは送信済み不明時に effect を再送しない、さらに狭い fixture 契約を採用する。
- [Stripe Payout object](https://docs.stripe.com/api/payouts/object): provider 状態と出金結果の照合の参考。Stripe の状態を `paid` / `failed_no_transfer` にそのまま置換した実装ではなく、実サービス固有の遅延失敗・reversal への対応は未実装。

この境界が準備できても、「実際に利益を送金できる」「銀行に入金した」とは表示しない。既存 MCP の `settlement_correlation` は照合候補の相関文字列であり、authoritative financial event と一致するまでは残高に影響させない。
