# 新旧 client / slot / 台帳の互換・復旧対応表

同じ producer `9abf78a80d27aa9f847c4051d20e4c552e407276`。回収済み host 原本と凍結 source のみ再読取し、稼働中 C の VM/台帳へアクセスしていない。全 test ID と case SHA は [対応 JSON](evidence/os-local-final/compatibility-matrix.json) に記録。金額・資産は開発 fixture の合成値。旧版を実行していない範囲は合格へ推論しない。

| ID / 対象 case | 元期待 | 実測 | 適用範囲 / 証拠 |
| --- | --- | --- | --- |
| C01 旧GX00 narrow client → 新SDK明示import | 元request/key/receiptとsource DBを保存し同一key replay | PASS。旧clientで実begin→1requestを明示import→import再試行同receipt→元source全typed不変→SDK retryが元server replyと一致 | 既存狭い(operation,key) APIのみ。旧配布OS/binary一般互換・黙示migrationではない [D, P] |
| C02 managed listenerへの旧/unbound Wallet path | owner境界を迂回するlegacy path/body/tokenをdispatch前拒否 | PASS。owner body injection/別token/authority/legacy pathが拒否 | 旧v2 clientを新Game台帳へ移行できるという証明ではない [D, P] |
| C03 非空legacy Wallet/Entitlement → Game勘定migration | CLAIMED月額、ATM hold、pending sale、失効credential/counter、receipt/BLOB/rowid/sequenceを保存 | PASS。全旧typed table/pragmaとEntitlement全体、Walletのposting CHECK以外の旧schemaを照合。同migration IDのみ。旧失効approvalから新支出は拒否 | 停止managed authorityへの明示host操作。OS local台帳→remote Gameprofile転換ではない [D, P] |
| C04 migration commit前/後 SIGKILL | 前は元schema、後は完全新版と元migration receiptのみで同ID再開 | 2/2 PASS。直後was_installed=False/True、双方19旧typed tables保存、AVAILABLE5000/PENDING200、opaque BLOB不変 | 実SIGKILL・software SQL境界。電源断認証/任意schema rollbackではない [D, K] |
| C05 未確定交換・claim後 SIGKILL | 応答不明を失敗と決めずhold/元apply bytesを保存、一度だけ照合 | PASS。復旧前hold103→後principal100+fee3、hold0、Game0→10、元request保持、PENDING200不変 | 元signed terminalによる確定。timeout/NOT_FOUNDだけでhold解除しない [D, P, K] |
| C06 current-copy: Wallet epoch/最初のGame epoch/最終receipt直後 SIGKILL | 元current sourceと同intentで中断再開、元writerを無効化、独立A/B epochを一度だけ進める | 3/3 PASS。Wallet/A/B epoch1→2、same intent DONE、source RETIRED、全typed snapshotと各epoch receipt hash保持 | 同host・停止した正確なcurrent copyのみ。任意過去backup、cross-host restore、revocation取消ではない [D, K] |
| C07 旧Wallet/current index・current Wallet/旧index・旧epoch apply | 混在をopen前拒否、遅延旧applyを拒否、元terminal/holdだけ照合 | PASS。両方向混在拒否。issuer CAS後の元APPLIEDは一度だけCOMPLETED、未適用側は永久REJECTEDを照合してhold解除、元request receipt保持 | 全構成old-copy rollbackの自動調停なし。新epochへ旧applyを再署名しない [D, P] |
| C08 同9ab派生slot間のA/B rollback・書込中断 | 実stage0で破損拒否/health失敗rollback/途中書込後保持/後続更新/重複排除 | 8/8 PASS（tamper,restage,stage-failed,health-fail×2,interrupt,recover,final）。途中書込の実QEMU SIGKILL1件を含む | 両slotは同9ab派生release marker。旧b828 OS＋新Gameuserdataの互換を試したものではない [AB, D4] |
| C09 正しい署名のforeign data ABI | rock-data-v1を維持しincompatible-data-v2を書込前拒否、slots/state不変のまま再起動 | canonical3/3 PASS。valid B staging→foreign ABI拒否→同拒否proofを保持したcommitted B再起動 | data migration NOT_IMPLEMENTED。外国ABI拒否は既存旧OSの読書互換を保証しない [ABI, D4] |
| C10 既存local Wallet→Gameprofile自動転換／旧b828の新userdata読書／旧OS一般rollback | 別の明示migration/reader・writer matrixが必要 | NOT_IMPLEMENTED / NOT_RUN。本候補はfresh Gameprofile導入。旧profile/VMを自動変換・初期化していない | C01〜C09のPASSからこの未実施範囲へ拡張しない [S] |

参照 SHA-256（全て実bytesを照合、ABI leafは既回収archive/完全case記録によるもの）：

- **D** `3f5f9093ed989edc9d38e6d6072c950196fbea913409f1f0b084cd3b142cbcf8` — `/Users/kaiya/Documents/Codex/2026-09-10/j-a-r-v-i-s/work/rock/docs/evidence/gx01/final-9abf78a-20260910.json`
- **P** `b908cbc2895bf7dc12e4d37728cd35e7884f9dbc22b016919815092b5f99eb50` — `/Users/kaiya/Documents/Codex/2026-09-10/j-a-r-v-i-s/work/rock-game/work/final-game-9abf78a/acceptance-progress.json`
- **K** `1d25e58d786e43e27d853e01db2a48bf15dcf29df41e86dc9a17500158473594` — `/Users/kaiya/Documents/Codex/2026-09-10/j-a-r-v-i-s/work/rock-game/work/final-game-9abf78a/kill-corrected-report.json`
- **AB** `6f72d5736d93a01a8c7920ea51fcea06d19947eb29c6c0915125ecdc0310ca6d` — `/Users/kaiya/Documents/Codex/2026-09-10/j-a-r-v-i-s/work/os-acceptance/final-d4-ab-report.json`
- **D4** `e93dca22501e92f31d098a99abfdb8f8731e77ca1ac8df1df94dc310be042f7d` — `/Users/kaiya/Documents/Codex/2026-09-10/j-a-r-v-i-s/work/os-acceptance/final-d4-continuation-report.json`
- **ABI** `2744feec51432b3d9348bfdc30726956c1d737f36a09241621c1165ec49b6864` — `/var/tmp/rock-release-os-20260910/final-9abf78a-d4-continuation/data-abi/report.json`

元ARM64全native FAILと、Dの初回188 wrapper FAIL、D4元whole FAILはそのまま保持。選択された正常test177件と別0700の実SIGKILL11件を、一つの188全PASS runと表現しない。D5の新規VM全構成復元・現行native UIの結果は親の別証跡へ対応させる。

ローカル OS gate の全対応・元 FAIL と fresh C 引渡しは [local scope report](os-local-final-20260910.md) に記録。S は凍結9abの対象 source bytes（JSONに4file SHA）であり、未実施互換の合格証拠ではない。
