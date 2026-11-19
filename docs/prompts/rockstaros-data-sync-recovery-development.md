# RockstarOS データ・同期・復旧の開発実行プロンプト

作成日: 2026-10-21（America/New_York）。主担当は Product / UX の OS10 / ROCK。これは**実装を進めるプロンプト**であり、文書だけを追加して終了しない。RockstarOS Core が本人性・権限・仕事・予算・保存/復旧を管理し、Sky は能力接続、Eve は依頼・競合・成果・費用を示す。既存 RQ01〜RQ49、特に RQ10・RQ12・RQ20・RQ27・RQ48 と [共通アルゴリズム](../rockstaros-complete-design.md#data-sync-recovery-algorithms)を保持する。追加の [A16・A13・DATA01](../../data/rockstaros-research-reconciliation.json) と矛盾させない。

## 0. 現在地を固定し、作業入口を同期する

着手時に正本5ファイル、`docs/workstreams/README.md`、責任分界、Product / UX workstream、`docs/prompt-playbook.md`、実装承認、phaseGates、対象コード・試験・証拠を読む。GitHub refs、PR、同一SHAのCIを**再取得**する。2026-10-21の読戻しは GitHub main `01b6aecd8b4d8bd2385665232dfb4b57029f991f`（同一SHAの `verify` と5つの security/repair check が成功）、実在する `codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`（`source-preparation` のみ成功）。このcheckoutの `origin/main` は `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a` の古いローカル参照で、作業木には多数の未commit差分がある。`npm run prompt:context` は今回GitHub文脈を確定できず exit 2 だったため、上記はGitHub接続から同等の読取りで取得した値である。次の担当は実装直前に再取得し、取得失敗を最新確認済みにしない。

mainには PR #181 の Jennifer 外部AI送信台帳のmigrationが統合済み。PR #105（仕事/Walletの二重保存と復旧競合、head `6b72470ce25d4e7b20940b1698fde5a12281ed69`）は**open・main未統合**で、同一SHAの `verify` は成功だが `SPIDER / secrets` は失敗。PR #104（Grid receiptの中断復旧）は別の PR #103 系列で open。PR #130（main catchup）も open。これらの実装・証拠を精査し、合格部分を選択的に再利用する。open PRの機能をmainへ反映済みと記録しない。

製品baselineの旧監査を照合するときの**履歴上の起点**は、当時のmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native branch head `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design branch head `de5b102d3525daccf604efd5685bdf8c14ad5d50`。これらを2026-10-21現在のheadやCIとして扱わない。

最初にmainと作業branchの差、既存dirty変更、引継ぎ入口と優先順位を保全・同期する。必要なら分離checkoutを作り、元の作業木をreset/強制上書きしない。mainの新機能を古いbranchの欠落から「未実装」と判断しない。同期したsource SHA、対象path、採用/保留理由を記録する。

## 1. 既存契約を棚卸しする

次を実際に読み、`要望 / main SHAとbranch SHA / source / 実装状態 / fixture・host・端末・Provider・本番の証拠 / 不足`の表を作る。

- 仕事: `lib/workflow.ts`, `lib/work-store.ts`, `app/api/work-jobs/route.ts`, `app/api/work-jobs/composition/route.ts`, `db/schema.ts`, `drizzle/0002_work_jobs.sql`, `tests/workflow.test.mjs`。現在のWebはowner条件、仕事revision CAS、job内command IDの重複検査を持つ。これを全端末・全外部作用の保証と呼ばない。
- Cloudと費用: `lib/a2a-delegation-store.ts`, `lib/a2a-delegation-recovery.ts`, `lib/a2a-usage-receipt.ts`, `lib/remote-ai-text-store.ts`、対応migration/API/試験、mainのJennifer送信台帳、Wallet予約/台帳。送信済み・結果不明・予約保持・精算済みを混ぜない。
- 成果/退出: `lib/a2a-result-handoff.ts`, `lib/sky-owner-export.server.ts`, `lib/system-backup.ts`, `tests/system-backup.test.mjs`。Web設定backupはallowlistの端末設定だけ。仕事/成果/使用量の全損復元証拠に転用しない。
- Android/Native: `docs/os-prototype.md`, `docs/native-os-integration.md`, `docs/native-os-validation.md`, `docs/phone-preview-20260911.md`、実装元のSQLite/backup/restoreと対象試験。Pixel 10 GL066/frankelの試験署名APKによる再起動23/23と、全OS image/Keystore全損/別環境復元を区別する。

## 2. 不足を原因から直す

| ID | 現在の差・原因 | 修正順とROCKの成果 | 合格証拠 |
| --- | --- | --- | --- |
| DSR01 | job内の操作ID・revisionはあるが、job作成/外部作用/使用量の一意契約が経路ごとに分かれる | 認証済みowner、object種別、operation ID、正規化入力hash、writer epoch、expected revisionを固定。既存IDと保存形式を移行互換で拡張し、同一key同一内容は保存済み結果、内容違いは409 | 別owner拒否、同時二端末作成/更新、再送100回でもjob/操作/成果/usageが各1件、古いrevisionで上書き0件 |
| DSR02 | DB確定とProvider送信の間で応答が消える。個別の送信claimを全sinkのexactly-onceと誤解し得る | 既存台帳を再利用し、送信前outboxにpayload hash/approval/予算/Provider keyを固定。ACK消失は`uncertain`へ移し、同じkey/referenceで照会。保証のないProviderは自動再送・予約解放を止める | 送信前/送信直後/Provider確定後のSIGKILL、遅延・逆順応答、異Provider再送で外部作用と請求を二重化しない。A16 D/Q/M/Fの不足を明示 |
| DSR03 | lease/heartbeat/checkpointが仕事全体の旧worker遮断として未受入 | job/attempt/owner/epochに結合した短期lease、単調fencing token、期限/停止/失効後の作用拒否を実装。step・入力/Tool版・確定reference・未確定outbox・残予算をcheckpointへ原子的に記録 | 旧workerの遅延commit拒否、heartbeat消失→期限切れ→新worker再開、checkpoint直後の再起動でも確定作用を再実行しない |
| DSR04 | 原本、表示、receiptとusageの照合強度が成果経路で異なる | artifact ID、原本byte hash/size、projectionの元ID/版、実行receiptとusage IDを別保存。保存時と読戻し/export/restoreでhash検査し、破損なら表示・精算を止める | 正常byte一致、1bit破損、欠落、別owner参照、同usage ID/Provider reference重複と異内容再送の拒否 |
| DSR05 | Web D1、Android SQLite、Linux diskは別正本で、端末間同期済みではない | recordごとにauthoritative writer/epochを決め、owner限定event cursorとsnapshot/hashを返す。offline操作はbase revision/operation ID/hashで保留し、再接続時は順序提出。内容競合をEveで両版表示し本人に解決させる。承認/送金/外部送信/失効は自動mergeしない | 二端末のoffline編集、cursor欠番、逆順/重複event、停止依頼未受領、旧端末writer拒否の画面/API/DB読戻し |
| DSR06 | 端末設定backupと仕事/成果/台帳復元は別で、別環境全損復元が未受入 | 既存Android/native backupを棚卸しし、owner/schema/generation/epoch/全hashのmanifestと暗号鍵の復旧範囲を固定。空の別環境へ復元後、旧token/承認/leaseを失効し新epochへ再bind、未確定作用を照合 | 別環境の空targetで件数・hash・receipt一致、旧writer拒否、鍵喪失・破損・旧schema拒否/安全移行。所有Pixelの破壊試験は別gate |
| DSR07 | export/削除/契約終了の範囲と保持値が未確定 | 原本byteと独立reader、履歴/明細/復号鍵の持出しを検証。契約版に保持/法的保持/削除猶予/backup消去/退会後取得期限を結び、未決定値で自動削除や販売を始めない | 模擬Cloud停止後の別reader読戻し、削除済み本文拒否、保持receiptの区別、契約終了後の期限/回収試験 |

各段階で原因、変更したsource、migrationの旧reader/rollback、正常・否定fixture、未解決条件を記録する。schemaや画面だけの完成宣言をしない。既存Walletを作り直さず、Provider custody/決済・請求書発行はEXTERNAL、sandboxの一周はJOINT、競合の選択・削除/持出し・料金/保持条件はOWNERとする。

## 3. 実装と受入の順序

1. **縦断基礎:** 同一ownerの代表jobをWebの作成→明示承認→一回実行→成果/usage→Eve読戻しまで、既存workflowとWallet予約を使って固定する。DSR01・02の否定fixtureを先に作り、永続DB transaction/CASを通す。PR #105の該当修正は採用前に現mainと同じfixtureで比較する。
2. **停止と再開:** DSR03・04を同じjob/attemptへつなぎ、応答消失、SIGKILL、期限切れ、旧worker、破損を試す。Provider側が照会不能なら`uncertain`で止まることを合格に含める。
3. **二端末と復旧:** DSR05・06を追加し、Web/Android/Linuxで同じ業務契約とfixtureを照合する。特定端末が未接続ならその実装・実機gateを別記し、Web合格を端末合格へ換算しない。
4. **退出:** DSR07の持出し・保持・削除を本人別に実装/検証する。料金・契約期間の未決定はfail closedにする。Eveでは費用/予約/不明結果/競合/停止の受領状態を普通の言葉で区別する。

最初に対象の小さい試験を実行し、変更箇所へ意味のある回帰を加える。候補コマンドは `node --experimental-strip-types --test tests/workflow.test.mjs tests/a2a-delegation-recovery.test.mjs tests/a2a-delegation-store.test.mjs tests/remote-ai-text-store.test.mjs tests/system-backup.test.mjs`、DB/Wallet/Android/native固有試験。統合前に `npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify` を実施する。UI変更なら該当UIを実操作する。長いlog・image・backup実体はGit外に置き、同一候補SHA、command、件数、失敗箇所、hash、環境区分だけを証拠へ保存する。途中で全verifyが既存のWeb security実測hash等で停止したら、原因と該当sourceを確認し、未実測の成功証拠へ書き換えない。

完了報告では`docs/templates/os-acceptance-report.md`に host/fixture/QEMU/emulator/試験署名Pixel/Provider sandbox/本番を分け、文書保存・作業branch commit・GitHub保存・main統合・Sites配備を別々に記録する。Pixel全OS build/正式署名/flash、実資金、実Provider請求、一般公開は各既存gateで判定する。最後にRQ01〜RQ49とA16/A13/DATA01の漏れ、月16 USD枠付き契約・同一契約複数端末の基本料重複防止、ATM自社手数料0、予測市場/ゲーム資産売買未許可を自己点検し、次の担当が同じSHAと未解決条件から再開できるようにする。
