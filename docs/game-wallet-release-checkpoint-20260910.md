# Game / Wallet / SDK — 2026-09-10 作業記録

担当D。起点 `91debc28174d87be023b789980d2c46112a66979`、専用branch `codex/game-wallet-release-20260910`。全体T0は05:43:35 UTC、終了予定13:43:35 UTC。統合・README・進捗JSONは統括担当が更新する。ホスト限定の合成試験と、新OS imageの受入を区別する。

- GX00 / RQ06・13・14・15 / 0→1・秘密を探す・べき乗則 / 別gameへの再照合で同じkeyが衝突し復旧できない / OwnerRouter・C・既存WalletAuth・current_restore.snapshot / game identityを含む版付きnamespaceと旧receipt完全一致read-through、既知未達4TLS例 / 誤衝突0・二重請求0・対象外全typed rows/schema変更0・scope残留0 / 実loopback TLSと再起動、Linux対象回帰で判定。

## GX00 完了

GX00: 新しいreconcile namespaceは `owner-reconcile-v2 / device / game authority / game / operation / key`。旧成功receiptは元行を変更せず完全一致再送し、旧keyが同gameの別requestを指す場合は拒否する。旧keyが別gameのものなら新版namespaceへ記録する。schemaは変更しない。狭い既存owner clientの `(operation,key)` journal制約は維持し、server修正を一般SDK完成としない。

追加の4受入例は同じ実TLS/Handler/OwnerRouter/C/serviceで実行する。同一workerの例はテスト専用single executorから無変更の実 `process_request_thread` を呼ぶ。productionをpool化したという意味ではない。HTTP総期限3秒は維持する。

Linux実行場所: `/var/tmp/rock-release-game-20260910`。既存VM/台帳を触らずtemporary directoryの合成fixtureを用いる。初回managed TLS回帰は10件/2.741秒/PASS。ゲーム回帰74件/33.373秒、owner/fence回帰52件/3.528秒（新4例を含む）は全件PASS・skipなし。要約は [受入証拠](evidence/gx00/release-required-acceptance-20260910.json)。元legacy月888/ATM hold/pending/receipt/BLOB、current-copy停止条件を回帰する。

## 未完了

統合候補の全体判定、GX01交換契約・外部Game A/B台帳・worker・復旧、DX01 reference SDK・sandbox導入計測、OS側UIと同image D4/D5は未完了。この記録だけではいずれも合格にしない。

- GX01 core / RQ05–08, 14–17 / owner専用承認と未知結果での資金保存 / Gameごとの通貨購入がない / GX00のC・OwnerRouter・private SQLiteとATM認証検証を再利用 / 明示非空DB移行と3つの追加勘定・専用quote/署名・hold/outbox同時commit・独立A/B TLS台帳のみ追加 / duplicate grant・誤解放0、Cロック下external I/O 0、3秒期限 / `test_game_exchange_tls`: Linux 8例 6.967秒 PASS（skip0）；全GX01合格やOS組込完了はまだ主張しない。

- DX01/SDK・公開sandbox / RQ06・08・14–17 / 原requestを保持し秘密と役割を分離 / 二Game同keyと再起動時の接続再開ができない / 既存v3 TLS・GX00 ownerclient・RemoteWallet cache・C lifetime・stage0 source guard / pergame journalと明示旧client import、専用author SDK、初期0のowned lifecycle・新署名profile / 二重付与0・元receipt変更0・起動停止による金融/未知行変化0 / Linux SDK+facade+core+非空migration16tests11.388秒PASS、A独立5DB/71table/8JSON不変PASS。実image派生/OS受入とprocess-kill/epoch復元は別途継続。

- GX01 current-copy・SIGKILL / RQ08・14–17 / 原writerと複製writerの同時支出を拒む / 応答喪失と復元途中で資金の所在が不明になる / actual C proof・既存GX00管理epoch・独立Game journal・typed snapshot / 各Game issuer CAS/receipt、全current archive、aggregate停止gateと累積retired OS名のみ追加 / 元bytes保持・二重付与0・未知時の誤解放0・旧epoch支出0 / 実SIGKILL11境界と既存current-copy/異常系をLinuxで再起動検証、OS aggregateはB/統括の同image受入へ接続。
