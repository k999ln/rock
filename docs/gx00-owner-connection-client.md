# GX00 owner 接続要求の保存と復旧

`os/game_exchange/client.py` の `OwnerConnectionClient` は、既存の認証済み v3 Wallet route に接続する専用 owner client。GX00 begin/approve/revoke と現在の status だけを扱う。旧 `RemoteWalletService`、server/runtime/C、接続 wire schema は変更しない。交換、資産、逆方向、実資金、OS UI、一般ゲームSDKは未実装である。

trusted bootstrap は `OwnerConnectionClient(private_state, transport, games=tuple, keys=KeyRegistry, clock=...)` を作る。transport は実 `HTTPSWalletTransport` の明示v3、固定 owned-development HTTPS endpoint、公開合成資格情報に限る。games/keys は保護された明示snapshot。任意callback、外部URL、live key探索、request由来の鍵追加を行わない。owner/accountをconstructor引数にしない。

`dispatch(request)` は既存の厳密owner requestを取り、begin/approve/revoke要求を **送信前にprivate SQLiteへcommitし、directoryをfsync** する。`retry(operation,key)` は保存済みの同一bytesを読み、同じ要求を送る。clientは新しいkeyやassertionを生成しない。署名ceremonyは既存の明示game-purpose authenticatorを使い、PINやprivate signing keyをclient journalへ保存しない。

## 固定する相手と正本の境界

stateには、origin、authority、device、token hash、CA/protocolを含む既存transport fingerprintに加え、**実SSLContextのCA DER集合、TLS min/max、verify設定、固定timeout**と、実使用game descriptor/KeyRegistry全記録のdigestを固定する。各送信前と応答後に再確認する。初期fingerprint文字列を据え置いたCA追加・鍵snapshot差替えでも拒否する。TLS最低1.2、通信timeoutは有限0.05〜3秒で、途中変更や無期限化を認めない。

owner/account/device revisionは、最初の実TLS begin receiptから取得する。authority/device、正しいgame proof、scope/期限、request hashとbindingを照合してから保存し、以後変更を拒否する。callerがbodyへowner/account/pathを足すと既存strict schemaで拒否される。別deviceへpending challengeを移さない。

ここでpinする「index key」は実際のgame proofおよびWallet shared/cursor署名鍵である。現wireはindex UUID/path/epochを返さない。clientはそれを推測せず、indexとWalletのcurrent descriptor照合は既存server/Cの責務とする。このclientはindex restoreや独立したrollback検出を追加しない。

## 再送と現在の権限

journal keyは `(operation,key)`。同じ文字列をbeginとapprove/revokeで使える。同operationの同keyでbodyを変えると拒否する。別keyでも、既に保存した同game/playerのbegin、同intentのapprove、同connectionのrevokeを新しい操作として作り直さない。このclient内では2gameのbeginに別keyを使う。server側のより広いnamespaceを狭めるclient方針であり、同じゲームを別owner clientが使うことは妨げない。

成功receiptもローカルだけから返さず、**毎回実serverへ同一要求を送信**する。現在のowner資格・Wallet credentialが拒否された場合は、そのbounded denialを返し、以前のreceiptで上書きしない。過去のreceiptは保持する。失効時に元操作が未commitだったと断定しない。

| ローカルのlast_contact | 意味 |
|---|---|
| PREPARED | 保存済み。まだ有効なacknowledgementなし。crash後は送信有無を推定しない |
| UNKNOWN | 通信/応答検証/送信後SQLiteまたはfsyncが失敗。元requestと取得済みreceiptを保持 |
| ACKNOWLEDGED | 今回の実認証経路で同じimmutable receiptを確認した。接続の現在ACTIVEを意味しない |
| DENIED / REJECTED | 今回の実TLS応答が認可/方針拒否。旧receiptは削除せず、アクセスを許可しない |

beginは元proofとbinding、approveは元intent/challenge/assertion digest/counter、revokeは固定鍵の実署名とconsent/connectionを照合する。既に保存した成功receiptが違うreceiptへ変わった場合はUNKNOWNとし、元receiptを保持する。

`game.connection.status` は保存されたbegin/consentへ一致する**毎回の実TLS投影**だけを返す。current state/generation/as_ofの逆行や、既知のsigned revokeとの不一致を拒否する。status wireにはfull signed receiptがないため、存在しない署名を検証したとは称さない。serverのTLS current projectionと明示されたreceipt hashを使用する。offline cacheや保存済みACTIVEから現在接続を推定しない。

approve結果が不明なら、先にそのapproveの同一要求を回復する。revoke/statusを架空のconsentで進めない。期限切れのpending beginも同一要求で元intentを照合できるが、返るintentが新しい承認可能時間を与えるわけではない。

## storage・容量・close

既存 `PrivateStore` のown0700 canonical directory、保護された祖先、own0600 single-link DB/lock、プロセス寿命flock、毎transactionの存在/inode検査を再利用する。要求、取得済みreceipt、owner、intent/consentは削除・差替え不可。元の要求本文やassertionを含むjournalは非公開で、ログに出さない。

最大10000要求を保持し、容量満了では新規要求を送らず拒否する。期限でpendingやterminal receiptを削除しない。`pending(limit=50,after=(operation,key))` はローカル再送一覧のkey/hash/contact状態だけを最大50件ずつ返し、現在の接続状態やowner秘密情報を返さない。

受理するrequest/replyは既存connection canonical JSONの最大64KiB。再利用するHTTP transportの受信上限は1MiBで、受信後にconnectionの64KiB上限を適用する。無制限受信や大きなbodyの受理へ変えない。

一つのclientは操作とcloseをmutexで直列化する。各実exchangeの通信は上記有限期限。closeは使用中の処理完了後にDB/lockを閉じ、close失敗時の再試行を妨げない。transportは要求ごとに自身のsocketを閉じる。共有Walletや他clientを停止しない。

## 実測する範囲

`tests/test_game_connection_client.py` は非空の `LegacyGameBasis`、実OwnerRouter/C/WalletAuth、実loopback TLS、実SQLiteを使う。4接続のbegin/approve/revokeそれぞれについて、**server dispatch/commit後、実socketのHTTP応答だけを切断**する。clientとactual listenerを同じportへ再openし、同IDを回復してcounter/consentが追加されないことを確かめる。元月888CLAIMED、ATM hold、pending、失効credential、receipt、BLOBも保持する。

送信前SQLite拒否、送信前directory fsync失敗はsend0で確認する。送信後receipt INSERT/UPDATE失敗および実directory fsync失敗ではUNKNOWNを保ち、復旧後に元要求だけで照合する。異owner/device/token/CA/protocol/keyのfingerprint拒否、実CA追加、timeout変更、認可失効、foreign game、不正counter/署名、receipt差替え、容量/lock/unlink/closeも別負例として実行する。

これはhost合成owner clientの受入である。GX00全体、external game、hardware passkey、新OS/data ABI、GX01、実資金の合格へ換算しない。
