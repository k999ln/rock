# Rock — 設計・プロンプトと実装の再照合

確認: 2026-09-09 16:51 UTC。改訂前の入力snapshotであり、実行開始時は再取得する。

後続の実装・試用・検証は[実装の保存時点](implementation-checkpoint-20260909.md)に記録した。以下の「未着手」「未実装」「未承認」は上記時点の状態であり、現在の進捗を上書きしない。

## 1. 現段階はどこまでか

| 入力 | 対象SHA | 事実 |
| --- | --- | --- |
| main | `7cdbb5fedc86ee3978ed329d9312147d137c9199` | 既存Web/Android P1・旧ベース。native未マージ。同SHA verify成功 |
| `codex/integrate-native-os-20260909` | `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5` | native OS/Hub/Wallet試作。PR #1 OPEN。同SHA source-tests/Android/Web成功 |
| `codex/os-game-design-review-20260909` | `de5b102d3525daccf604efd5685bdf8c14ad5d50` | 設計v1.0・RQ12〜15・実行プロンプト保存。main/native未反映。check-run 0 |

GitHub全branchは上記3本、open PRは[#1](https://github.com/k999ln/rock/pull/1)、取得したclosed PRは0。3refをfetchしてSHA一致確認。CI根拠: [main verify](https://github.com/k999ln/rock/actions/runs/34368901643/job/102524716373)、[native source-tests](https://github.com/k999ln/rock/actions/runs/34318525801/job/102359820423)、[Android](https://github.com/k999ln/rock/actions/runs/34318525747/job/102359820156)、[Web](https://github.com/k999ln/rock/actions/runs/34318525748/job/102359820133)。check-runなしを合格にしない。現在のCIはmain push/PRが対象で、review branch単独pushは対象外。

既存native source回帰1,031件と旧基準版QEMU起動実績はあるが、最新統合sourceからの新image build/boot/復旧受入はNOT_RUN。今回の新指示に対するB04/V01/B02/B03/B05/GX00/GX01/GX02/DX01は未着手。文書作業の完了や旧Web/Androidを含む件数をOS完成率にしない。

## 2. 発見した相違と訂正

以下のnative pathは `systems/rock-star-os/` 配下。静的照合であり、不具合再現やruntime修正を今回実行したわけではない。

| ID | 実装・設計の相違 | 今回の訂正 | runtimeで残る作業 |
| --- | --- | --- | --- |
| ALIGN01 / RQ10 | 最新設計がmainでなくPRなしreview branchにある。取得補助はmain/open PRだけのchecks、最後のbranch再照合なし | 3入力を明記。全branch SHAのchecksとref再照合、NO_CHECKS区別を補助へ追加 | B04で3入力/承認版を分離作業branchへ統合 |
| ALIGN02 / GAME-GAP04 / RQ06,13,14 | Walletは単一owner/Alice。設計の2game試験では複数playerの独立残高を証明できない | GX00と2作者/2game/2owner・複数端末の認証/台帳境界を追加 | 分離方式ADR、本人接続、正当系と越境拒否、互換/復旧を実装検証 |
| ALIGN03 / OS-GAP04 / RQ12 | backup schema2のhashはdisks配下だがverify-backupは旧userdata_sha256を必須参照。44固定local表のみ | B/D5に旧/新形式とA/B/data、profile別正本DB/追加表/backendの試験入口拡張を先行指定 | harness修正、新/旧fixture、最新image復元。backup本体の作り直し不要 |
| ALIGN04 / RQ06,12,13 | 台帳の版付き移行だけでは固定data ABIと旧OSへのA/B戻しを保証しない | GX00/GX01の互換表、移行中断、保留交換保持、台帳変更後D4/D5再試験を必須化 | migration/互換reader/ABIと復旧方針を設計・実装検証 |
| ALIGN05 / RQ10,12,14 | 文章の途中依存をstatusのtask依存だけで表現できず、実provider待ちや循環に誤解できる | phaseGatesで起動・native商品・合成Wallet・OS受入・複数owner・交換契約・SDKを分離 | 承認後に各段階を実行。OS受入は実ゲーム/実providerを待たない |

## 3. コードの根拠と保持する安全策

- 単一owner: `os/wallet_backend/server.py:234` のdevice scopeはAlice固定。`os/entitlement/wallet_bridge.py:26–29` は1DB1fixture account。`os/wallet_auth/service.py:269–274` は単一account binding。`src/blackberryrock/wallet.py` の金額/月額/idempotency表はowner列を持たない。これらを単純に外すと別ownerが同じAVAILABLE/同意/月period等を共有しかねない。
- 多端末は実装あり: `tests/test_wallet_backend_multi_device.py:135` と認証有効の `tests/test_wallet_auth_backend.py:132` は同じAliceの2端末/月額1回。別ownerの拒否試験はあるが、別ownerの正当な独立利用試験ではない。「認証なししかない」とは訂正しない。
- 本人接続: Wallet owner、購入端末、作者、game、playerを別IDにし、認証・同意からserver側で台帳を選択する。本人未確認のowner_id/player_idを信用しない。Rock端末を持たないplayerの本番資格は未決、作者sandboxへ購入義務を追加しない。
- backup: `os/desktop/backup.py:73–74,154–158` はdevice schema5→backup schema2/disks。`os/desktop/verify-backup.py:216–217` は旧keyを参照するため、新形式ではKeyErrorになる構造。実行再現は未実施。比較対象は同fileの44表のlocal台帳に固定されている。
- 更新: `os/update/README.md:143–150` は固定 `data_abi=rock-data-v1`、migration engine/userdata rollbackなしを明記。署名ABIは個々のDB query互換を証明しない。旧台帳再作成・receipt/保留消去・二重writerで回避しない。

## 4. 保存と実装を混同しない

今回の成果は設計v1.1、修正版プロンプト、受入雛形、進捗・検査補助。runtime/SDK/OS imageは変更しない。SSD/VMを起動せず、実資金・実ATM・実機・公開運営を開始しない。main/nativeへのmergeも行わない。確認用branchへ保存し、利用者の設計承認後だけ実行へ進む。

追加相談の予測市場/ゲーム資産売買は別の未承認候補。既存のゲーム通貨交換から市場運営を自動追加しない。市場案が採用されてもHub＋WalletのOS稼働を先に固める。

入口: [確認用設計](os-hub-wallet-game-design.md)、[実行プロンプト](prompts/os-operational-base-next.md)、[受入雛形](templates/os-acceptance-report.md)。今回の文書/補助の実行検証は `docs/validation.md` に別記する。
