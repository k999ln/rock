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

- DX01-SDK / 同一所有者・端末別承認・越境拒否 / 追加端末に元端末の署名要求を移す不便を除く / 既存 connection journal と実 OwnerRouter を再利用 / 認証済み owner の接続取得と SDK recover_connection のみ追加 / 2 owner/player・2 Game/作者・追加 A2・同一外部キー・失効後再送 / Linux 実 TLS SDK 8 tests, 8.420s, skip 0 PASS (`work/gx01-sdk-multi-owner-final2.log`)。A2 は元 A1 intent/consent を保持して履歴を共有し、購入では A2 固有の新規 challenge を要求。B1 越境と元 A1 challenge の A2 使用を拒否。失効は provision 入力の書換えではなく retained OwnerRouter / Game author の実 revoke 操作で検証。

- GX01-CONTRACT / 期限と独立台帳 / Game A の遅延で B・ATM を止めない / 実 TLS listener と既存 worker・ATM を再利用 / transport の実 CA/hostname/宛先/credential/期限を送信前後に固定検査 / A の 3 秒期限、B と ATM の 2 秒内完了、hold 103 保持・ATM fee 0・最終 grant 一度 / Linux real stalled TLS 2 tests 4.249s skip 0 PASS (`work/gx01-real-tls-stall-first.log`)。A 応答保留中に B 決済と ATM 発行/取消が完了。A timeout→実 NOT_FOUND→元 apply の照合で資産を一度だけ付与。

- DX01-SDK / 作者と owner の権限分離・元要求保持 / 新しい環境で接続・購入・障害診断を再現できない不便 / 同じ reference SDK と software test authenticator / host-only owner/author CLI・公開 pin config・120秒限定 onboarding harness / 設定入力2、実コード行数、初回交換・原因特定・復旧の machine elapsed / 例の実 TLS 2 Game 登録→同意→購入→再起動→元 setup/購入再送 test 1.911s PASS、fresh Linux メトリクスは別実行で保存予定。

- DX01-SDK / 複数 owner の独立 authority と元 receipt 保存 / 一作者の同 key が別 player へ衝突する不便 / 既存 author SDK journal を再利用 / connection_id 入り v2 namespace・元 v1 exact read-through・明示した追加 Wallet UUID pin / 同じ作者インスタンスの Alice/Bob quote、曖昧 retry 拒否、再起動元 receipt 一致、未知 Wallet pin 拒否 / Linux SDK/golden/sample12tests13.578s PASS、その後追加の restart/pin 拒否を個別受入。既存単一 Wallet constructor/identity は変更せず、多 Wallet 構成は初回の明示 tuple で固定。

- GX01-CONTRACT / 厳密 JSON と署名 purpose 分離 / 他実装が canonical bytes を再現できない不便 / 実 TLS で作った quote/approval/apply/status/reject/terminal を再利用 / literal signed golden6件と独立 Node 検査 / exact bytes・SHA256・Ed25519・他 purpose 拒否・bool/float/未知field拒否 / Python3tests0.108s PASS、Node v26.0.0 six vectors PASS。公開合成 fixture 以外の鍵や利用者情報を含まない。

- GX01-CONTRACT / 失効と初回 dispatch の直列化・元の確定許可保持 / 未送信保留後に取り消した接続/credentialで初回付与される不便 / 実 C・OwnerRouter・author gate・WalletAuth・signed reject を再利用 / 初回 claim の同一 Wallet transaction で current connection/generation/期限・owner credential/terms/transport・author を再確認 / 失効前後4ケース、connection期限/時計rollback、同AVAILABLEのATM/月888/A-B競合、実TLS apply/reject race、実SIGKILL/epoch回帰 / 修正前7tests中4FAILを保持 (`work/gx01-claim-revocation-before-fix.log`)、修正後24tests23.062s skip0 PASS (`work/gx01-revocation-races-kill-regression.log`)。claim前失効はsignedREJECTED後だけhold解除、claim後の元apply/receiptは一度だけ解決。schema/API/3秒deadline不変。

- GX01-CONTRACT / unknownで保留維持・独立Game / 実Game commit後の壊れた応答で決済済みか判別できない不便 / actual GameHandler/SQLite commit と TLS transport を再利用 / test-only disconnect・65537byte応答・truncated応答を確定Game commit後に挿入 / A hold維持、B継続、元terminal完全一致、追加grant0 / Linux actual TLS fault matrix5tests14.309s skip0 PASS (`work/gx01-real-tls-fault-matrix.log`)。先行stallではA応答保留中のB/ATM2秒内完了・A3秒期限を保持。

- DX01-SDK / 接続診断の鮮度を明示 / offline cached snapshot を成功表示した実fresh SDKの不便 / 既存Wallet backend.connected/stale契約を再利用 / host sampleの診断は両fieldの厳密booleanを要求 / 実TLS停止後のcached表示・元quote pending完全保持 / 修正後Linux sample2tests4.929s skip0 PASS (`work/gx01-sdk-diagnosis-fixed-fixture.log`)。元fresh harness INCOMPLETEと、新testの未登録fixture準備不足ERRORも原本保持。core/guest/image/deadlineは非変更。
