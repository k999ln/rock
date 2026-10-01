# GX00 非空legacyと接続の共通fixture

`tests/game_legacy_basis.py` の `LegacyGameBasis` は復元担当が再利用するための試験用部品である。runtime製品コードの変更はない。旧 `/v1/wallet` と新 `/v3/wallet` は実TLS、ゲーム作者も同じmanaged listenerの `/v1/game` を使用する。仮のprincipal verifierや後からのowner registry差替えを使用しない。公開合成データだけであり、実OS/実ゲーム/実資金/復元の合格ではない。

最初に本物のOwnerRouterを作り、そのcanonical path/UUIDをCへ固定する。その後、旧WalletBackendServerへ実TLSで登録・credential enrollment・規約・月額同意・ATMの操作を送る。公開fixtureのWallet売上操作で5000を精算、237を未精算とし、実際の888 debitがcommitした直後にackだけを失わせる。CLAIMEDを残したまま1000 ATM holdと未解決quoteを作り、古いcredentialを失効し、未知のBLOB表を保存する。available3112 / pending237 / hold1000 / billed888となる。

本fixtureのA1は `fixture-rock-arm64-001`（旧deviceと失効credentialを保持）、A2は追加の正規Alice device、B1は正規Bob device。3つのowner transportと3つのsoftware authenticatorを持つ。A1のWebAuthn credential失効はowner transport失効とは別である。A1の新ATM/game承認は拒否されるが、A2が有効で元の月額同意がある契約では、A1/A2が同月の同じ受付receiptを参照しても新しい888 debitを作らない。

## 明示的な段階

| 呼出し | 結果と再利用点 |
|---|---|
| `LegacyGameBasis(private_root)` | 本物OwnerRouter/Cを初めから結び、original_router_identityを保存 |
| `create_legacy()` | 旧実TLSで非空台帳生成後、旧listenerを停止。`legacy_tables`、`legacy_business`、`legacy_snapshot`、旧要求/receiptを保持 |
| `adopt()` | `inspect_legacy/open_adopted` は同じ本物routerを使用。Alice account/authorityを維持し、Bobだけfresh作成。この直後に全旧schema/rowsを比較できる |
| `start_managed()` | 初回専用。正規A2 fulfillmentを追加し、2ゲームの独立fixture authorityとindexを作り、同じmanaged listenerへ2契約をbind |
| `activate_new_devices()` | A2/B1を同じ実TLSで登録/enroll。A2 accountは旧Aliceと同じ。Bobは別account、8000 available、月額同意false |
| `connect_four()` | A2/B1×game A/Bの4接続。実game-purpose署名、同一要求再送のimmutable consent、作者/game・owner越境拒否。既存財務・失効credential・旧receipt不変を比較 |
| `reconcile_existing_month()` | clockを既存retry時点まで進め、実schedulerを開始。CLAIMED→元billのPAID ackを3秒以内に確認。A1/A2から同月同keyを実TLSで再送し、同一receiptを要求 |
| `business_evidence()` / `assert_retained(test, claimed=...)` | 各runtimeの実C admission下で現在descriptorのDBを読む。旧退役元pathを誤って現在の復元先として検査しない |
| `stop_listener()` | 実listener/scheduler/runtime/router/indexを閉じ、C coordinatorと独立game authoritiesの管理ハンドルは保持。復元担当はこの後に別の明示current-copy APIを使える |
| `close()` | 全リソースを閉じる。private_rootの削除は呼出し側のTemporaryDirectoryが担当 |

`original_tables()` は既存Cのtyped全table/schemaハッシュを使う。Cが追加する既存identity objects以外を包括的に比較し、BLOBも保持する。adoption直後の全旧表一致と、その後の正規操作で増える新credential/game表・billing ackを分ける。

`legacy_business` は元の全Wallet idempotency receiptとDevice API receipt、元credential/public record/counter/失効状態、Wallet/Auth同意、両quoteとATM approval、元journal/posting/bill/hold/sales、CLAIMEDとclaim履歴、未知BLOBを持つ。正規billing回復後に変わってよい元authorizationの列は `state:CLAIMED→PAID` と既存 `wallet_bill_id` だけである。追加端末のWebAuthn counterはgame承認で進むため、元の失効credentialのcounterと混同しない。

本単位は初回adoptionから同一経路への連続性を確かめる。current-copy/new epochのゲームhandover APIは実装しない。復元担当は `stop_listener()` の後、Cとindexの正規handoverを実行し、新しいruntime/router/gateway/transportを明示的に組み立てること。`start_managed()` を復元の自動再bindに流用しない。C/owner registryや台帳をfixture都合で差し替えない。

## 検証

`PYTHONPATH=src:os python3 -B -W error::ResourceWarning -m unittest discover -s tests -p test_game_legacy_basis.py -v`

2ケースは、(1) 非空adoption→全旧表一致→3device/4game→実schedulerによる同月回復→旧register receipt再送と旧失効ATM承認拒否、(2) 旧credential/別owner/追加identity fieldsの拒否とconsent未作成を確認する。元のold-reader直接libraryの保護、OS UI、新data ABI、OS復元、外部game HTTP session provider、GX01はこの試験の合格へ含めない。
