# GX00 接続の限定host実装

本差分は `023976d` の既存 A/B/C managed Wallet runtime と `connection-v1` schema を使い、public synthetic の2作者・2ゲームを接続する。通常のserverは接続機能を有効にしない。凍結OS b8287bc、QEMU、実ゲーム、実本人、hardware passkey、実資金の受入ではない。GX01の交換・資産snapshot・game履歴は未実装で常にfalse。一般GX00完成、OSでの新データABI・backup/restore完了を意味しない。

後続で[要求を保持するowner client](gx00-owner-connection-client.md)と[停止済みcurrent-copyの管理引継ぎ](gx00-current-game-restore.md)を追加した。後者は元のC/B/indexを保持した限定手続きであり、以下の過去index・任意backup巻戻しの制限を解除しない。現時点では異なるgameの同じowner-reconcile keyの誤衝突と、同TLS分離の追加受入確認が残り、GX00-ISOLATIONは未合格。[保存時点の記録](implementation-checkpoint-20260909.md)。

## 入口と所有者

管理者が独立した `PublicGameAuthority` A/B、外部正本 `GameGateway`、既にopen済みの契約runtimeを作り、`ManagedWalletBackendServer(..., game_gateway=gateway)` を明示する。既存default/v1/v2を変更しない。gateway bind完了後だけ `gateway.capabilities().connections` はtrueになる。純粋schemaの `protocol.capabilities()` は引き続き全falseであり、そこから実装済みを推定しない。

ownerは既存 `/v3/wallet` と同じ Bearer + `X-Rock-Wallet-Device` + `X-Rock-Wallet-Authority` を使う。owner/router再照合→同じC admission→現在の購入端末scope→既存登録account/有効Wallet credentialを経由する。bodyでowner/ledger/account/device/pathを指定できない。2台のAliceは同一の既存account、Bobは別account。`acct-...` をUUIDに変換しない。ゲーム接続はWallet月額同意や課金を開始しない。

作者は同じTLS listenerの `/v1/game` で独立の作者Bearerと `X-Rock-Game` の単一値を使う。Wallet/deviceヘッダは拒否する。認証済み作者の保護されたgame mapping→現在のconnection index→既存runtimeのC admission→indexとWallet consent/headの再照合を行う。作者にWallet全残高・owner/account/device・他ゲーム・内部同意全文を返さない。操作は `connection.status` と `connection.revoke` のみ。重複ヘッダ・scope外操作・owner入口の作者資格情報を拒否する。

`PublicGameAuthority.proof(session, request)` は独立したprivate SQLite正本で固定public player sessionを照合し、player_id/displayをsessionから導出する。requestの厳密fieldsは `v:1,op:"connection.proof",key:id<=128,audience:wallet UUID,scopes`。player_idを送れない。player proof入口は今回Python fixture APIであり、外部ゲームのHTTP session providerを実装したとは扱わない。A/Bは別state・別proof key・別author tokenを持つ。公開合成tokens/seeds/PIN 0000は実ユーザーの秘密や実本人の認証ではない。

## 同意と中断

共有indexの `(game_authority_id,nonce)` と `(game_authority_id,game_id,player_id)` はそれぞれ原子的UNIQUE。予約時にbegin要求全文、生成済みintent/challenge、owner/account/device/revision、ledgerを固定する。期限切れ・失効・返答消失で予約を解放しない。同じgame/playerの別ownerへのtransfer・新intentでのreconnectは未実装で拒否する。同じplayer文字列を別gameで使うことは可能。

順序はindexのRESERVED確定→既存Wallet DBのintent確定→既存Wallet Auth assertion検証→**同じWallet transaction内でcredential counter更新・game challenge消費・immutable consent・初期signed headを確定**→index ACTIVE。両DBを1つの原子的transactionと偽らない。中断後は保存済みの同一beginまたはapprove/reconcileだけで前進する。署名検証前/後に期限を確認し、署名や期限の拒否ではcounter/consent/headを変更しない。Wallet確定後のindex不整合は503/返答なしの未確定であり、確定拒否へ変換しない。

`SoftwareTestAuthenticator.get_game_assertion(intent, pin, key)` は完全なintentを検証する明示game-purpose ceremony。既存ATM用 `get_assertion()` は `wallet.game.connect` を拒否する。UP/UVは従来通り公開software試験であり、実ハードウェアの保証はない。元deviceだけがapprove/その再送を行える。同ownerの別deviceはstatus/reconcile/revokeできる。

ownerの返答は以下の既存厳密objectsと限定envelope。

| 操作 | `ok:true,result` |
|---|---|
| begin | `rock-game-connection-intent/1`。同一要求では生成済みintentを返す |
| approve | `rock-game-owner-consent/1`。確定後の時刻が変わっても同一immutable consentを返す |
| reconcile | 同じconsent、または厳密な `{state:"AWAITING_OWNER_CONSENT",intent_id:uuid,simulation_only:true}`。keyと要求全文・結果をWalletに固定し、後続の状況確認はstatusか新しいreconcile keyを使う |
| revoke | `rock-game-connection-receipt/1` のREVOKED publication。同一keyのreceiptを保持 |
| status | `rock-game-owner-connection-view/1`。現在のindex/headと照合した表示 |
| list | 厳密な `{schema:"rock-game-owner-connection-list/1",items:[owner-viewまたはpending],next_cursor:tokenまたはnull,as_of:time,simulation_only:true}` |

作者status/revokeは `rock-game-author-connection-view/1` の現在投影を返す。失効/期限切れ後はplayer/scopesを投影しない。過去のACTIVE署名だけでは現在の権限にならない。Walletは最初のconsentと共有receiptを保持し、headのみ単調にACTIVE→REVOKEDへ進める。作者revokeの同一keyは同じ不可逆な状態遷移を再実行せず、参照時刻は現在の投影として更新される。

owner listはliveなUUID順のkeyset pagination。snapshot固定ではない。各ページは要求limit以下かつ48KBのitems予算に収まり、残りがあればcursorを返す。cursorはWallet authority/owner/account/device/credential revision/limit/filterに署名で結び、最大120秒。新しい行が既に通過したUUID位置へ追加される場合があるため、一覧全体の固定snapshotや履歴APIとは扱わない。最大1万の予約・proof・Wallet requestを超える追加は拒否する。

## 正本とwriter fence

indexはown0700のcanonical directory、own0600のsingle-link SQLite/lockを持ち、プロセス寿命flockを保持する。保護された祖先dir、必須ファイルの存在・inode、任意sidecarを各transaction前後に確認する。Wallet/C/B registry/game authorityと同一・祖先・子孫に配置しない。未印の既存DBを取り込まない。

Wallet modeはindex path/UUIDと完全なC descriptor（ledger UUID、Wallet authority、owner、writer epoch、canonical path）を固定する。index側も同descriptorを保持する。全runtimeのbind時にWallet intent/consentとindexの保持行を相互照合し、欠落・逆行をlistener開始前に拒否する。唯一の自動再試行は、まだ予約が1件もない初回bindの同一descriptor継続である。index lookup後も各要求のC admission中にdescriptorとcurrent headを再照合する。

lock順は C契約admission→game author gate→短いindex transaction、および既存Device/Wallet transaction。index lockを保持したまま別契約のC admissionを取得しない。作者失効は同じauthor gateと直列化する。serverは実HTTP workerをjoin→全runtime close/permit release→router close→index closeの順を守る。

CのWallet copy/restoreはこの外部game indexを復元しない。writer epochが進んだWalletに旧index epochを自動付け替えない。game接続はunavailableのままとし、通常Wallet機能を使う場合はgame opt-inを外す。indexとWalletの整合した過去copyを同時に巻き戻した場合、および同path/UUID・同headの過去indexによる作者失効記録の巻戻しを検出する外部high-waterは未実装。index restore/epoch adoption APIを提供しない。これらを安全な復元に対応済みと呼ばない。

## 証拠の範囲

`tests/test_game_connections_tls.py` は実A/B/C coordinator/runtime、既存Wallet/Auth/Store、実loopback TLSとSQLite、実OpenSSL署名を使う。2作者×2game×2owner/3device、同じキー/同じplayer文字列のscope、並行worker、署名改変/別device/追加identity/期限拒否、Wallet確定後にindex反映だけ失敗した再送、予約確定後にWallet intentがない場合の継続、全backend再起動、作者失効、cursor、古いindexまたはWallet copyの混在拒否を確認する。中断用test callbackは実commit後に例外を投げるだけで成功や偽consentを返さない。

`tests/test_game_storage.py` は必須lock/DB unlink、実二重writer、DB inode差替え、writable ancestor、未印DBを拒否する。旧Wallet/ATM/Authの実回帰は別に維持する。これらはhost合成接続受入であり、OS UIへの接続、OS D4/D5や実ゲーム資産/交換の受入ではない。

後続レビューで、index/authorityの互換しない既存schemaを拒否した際に、初期化済みSQLite/lockが残る2例を実測した。後段constructorの例外時cleanupを追加し、元DB bytesを変えず、例外を保持した状態でも別FDで実lockを再取得できることを確認。rootのゲーム回帰は追加2例を含む35件成功・skipなし。[統合記録](evidence/gx00/game-connections-root.json)。
