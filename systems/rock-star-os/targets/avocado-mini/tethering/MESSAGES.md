# Mini 小容量メッセージ共通adapter

MAT15 / M1 / ROCK。2026-10-25の本人指示に基づく日米のsi・メッセージ・小ファイル向けPython/SQLite実装。無線なしの共通protocolを検証する。Iridium JSPR/IMT・Quectel AT command・実UDP/socket・実Providerへの接続はない。機種・回線契約・実課金・実RF・閉箱携帯は未受入。Mini内でqueueと制御を持ち、携帯電話・Pro・PC・ドックを必須にしない。板・膜なし、少ない表示部、上下を含む全範囲、低眩しさを維持する。一般IP共有は既存[Linux/AP制御](ACCESS.md)の独立経路として保持する。

## 利用体験・責任

認証済み本人が許可した端末から小さなsi依頼・短文・ファイルを預ける。圏外ではMiniの有限queueに保存し、期限内かつ再開許可・電源・接続・料金枠が揃った時に一chunkずつ送る。送信待ち、送達、結果不明、再送終了、期限切れ、失効を区別する。送達は相手の受信保存までで、si処理成功・仕事の完了・請求確定ではない。

ROCKは分割、認証付きenvelope、queue、重複排除、予約、期限、停止、復旧を担当。EXTERNALはmodem/網側の全traffic強制上限と暗号化された実transport、国別適合・契約を提供する。JOINTで実機・回線・請求を照合する。OWNERが国、相手、データ送信、期間、料金/通信量上限を承認する。新たなWallet残高やsi実行予算を作らず、既存Controllerの同じSQLite通信予約とNetworkQuotaを利用する。

## 入出力・状態・保存

`message_adapter.py`の`MessageAdapter(controller, profile, key, network, transport, clock)`を、認証済みBroker内部からだけ使う。公開IPC・本人UI・Wi-Fi端末からの受付API・schedulerは未接続。認証owner/clientをrequest JSONから信頼しない。`Controller`、`NetworkQuota`を外部へ露出せず、運転中に下位objectを直接変更しない。

`profile`はJPまたはUS、profile ID、送受信peer、wire/ACK/overhead上限、message/queue容量、record数、試行回数、再送間隔、TTLを固定する。既存policyのowner/device/provider/契約/国/通貨/期間/料金と一緒にhashへ束縛する。国/相手/鍵/料金を変更した既存DBの再開を拒否する。新たな国別契約へ移る前に旧sessionを止め、未確定予約を照合し、本人の新しい承認を得る。自動移動・更新・上限増額はない。fixtureのJP/JＰY、US/USDは架空条件であり国別実サービス合格ではない。

| API | 意味 |
| --- | --- |
| owner_command(owner, revision, command) | 既存allow/revoke/reallow/enable/disableを同じ送信mutexで実行。端末の許可世代が変わった古いqueueを失効。停止/失効時は網側closeも試み、不明IDを返す |
| observe(owner, revision, observation) | trusted AP/modem/power adapterの最大60秒観測。message用ではtwoWayIp/internetReachableがfalseでもよい。既存一般IPgateはそれを許可しない |
| mark_link(owner, revision, profile_hash) | 実transportの非同期message能力・宛先profileをtrusted adapterが確認した後だけ現在の観測epochへ固定。UIの選択だけで呼ばない |
| enqueue(owner, revision, client, request_id, kind, payload, ttl) | `si/message/file`のbytesを保存。offline可。owner/端末許可/CAS、容量/TTLを確認。ID再送は同じ内容・同じ初期TTLだけ許可し、期限を延長しない |
| dispatch(owner, revision, request_id) | 明示schedulerの一回分。準備→local予約commit→網側予約→再検査→一回のexchange→認証ACK→網側close。自動loop/無制限再送なし |
| attachment(owner, revision, dock_id) | 旧観測/許可epochを閉じ、網側close。旧dock電源を持ち越さない |
| recover(owner, revision) / shutdown() | 共有OFF・dock/観測破棄・旧許可失効。未確定予約と有効queueを保持。復旧は新しい電源/リンク観測と本人再開が必要 |
| sweep(owner) / snapshot(owner) | 期限/失効済みpayloadを論理削除。snapshotは本文・鍵・envelopeを返さず状態/size/期限/試行数のみ返す |

変更系public APIは非bool整数revisionを必須にし、NoneによるCAS迂回を拒否する。constructorも旧実行許可を失効させる。同じprivate directoryの既存LinuxGate lifetime lockを取得するため、一般IPsessionとの同時運転を拒否する。両modeの同時実行は別統合課題で、切替えても台帳・旧予約を消さない。

private 0700 directory/0600 SQLiteを使用し、queue更新と通信予約を同一transactionでcommitする。recordごとに本文hash、端末許可世代、期限、chunk/ACK、試行IDを保持する。queueは最大1MiB application bytes、128 records、1message最大64KiB、最大8試行/chunkの実装上限。実profileはそれ以下の承認値を使う。既存grant4096件・NetworkQuota128件/64KiBの上限も独立して適用され、満杯なら停止する。完了/期限切れ後も有限のtombstoneと予約を保持し、slotや費用を自動再利用しない。

TTLは送信時・受信時・読取り時に強制する。sweepは期限切れ本文をDB上から外す。停止中のdaemonへtimerはないため、常駐serviceは起動時/周期的にsweepを呼ぶ必要がある。SQLiteの空きpage、filesystem snapshot、backupまでの安全消去・暗号化・rollback保護はOS storageの後段受入であり、この論理削除を安全消去と呼ばない。

## 分割・受信・再送

HMAC付きcanonical JSON envelopeの実byte数とbase64増分を含めて分割する。送信元/受信先/profile/ID/kind/期限/全体size/全体SHA-256/chunk index/総数/attemptを認証する。HMACは機密性を与えない。実transportの暗号化・鍵provisioning・失効は未接続で、実データを平文のmodemへ渡さない。

`Reassembler`は認証、宛先、国/契約、期限、型、容量、重複fieldを先に検査する。同じIDの異なるmetadata/chunkを拒否し、順序逆転を組み立てる。全chunkとsize/digestが揃うまでdelivery ACKを返さない。重複は再配送せず同じ状態を返す。受信queueも有限で、未完成・期限切れを完了扱いにしない。

`take(authenticated_recipient, request_id)`は保存済み本文の再読取り。消費側はID/digestを使って既存Job/Artifactへidempotentに保存し、commit後に`acknowledge(recipient, request_id, durable_receipt_id)`を呼ぶ。ACK後に本文を削除し、receipt付きtombstoneを保持する。読取り直後のcrashでは同じ本文を再取得できる。receiptは保存引渡しでありsi/Toolの実行許可・完了へ昇格しない。この消費側Job接続は未実装。

送信ACKは同じframe hash・request ID・index・profileに束縛する。ACK喪失や不正応答はunknownで、local予約を解放しない。次の明示dispatchは再送間隔後に別attempt・別予約を確保する。上限回数、期限、端末失効、量/費用上限のどれかで止める。受信済みchunkを再送しても新しい仕事を作らない。最終請求/実usageの照合は別で、未確定通信費を勝手に返金しない。

## 通信量・料金・停止の境界

各attemptは `送信envelope実bytes + 最大ACK bytes + 承認済み往復overhead上限` を予約する。費用は既存policyのall-in課金block・単価・grant feeを上限計算する。client枠、account全体byte/cost、既存IP予約/使用分を同じSQLiteで照合する。管理通信免除と網側期間全体hard capは既存NetworkQuotaの条件を維持する。固定費、下り/control、modem内部再送がこの契約でcoverされる根拠がなければ実transportを有効化しない。

`transport.exchange(frame, grant)`は供給されたgrantのbytes/cost/期限を全経路で強制し、隠れたretry、background spool、無制限read、無期限待ちをしない契約。fixtureはReferenceNetworkへ送信前/ACK前にchargeし上限・期限を確認する。実機ではcarrier hard capとdriverの停止/期限/出力制限の証拠が必要。任意のcallbackを実Provider保証と扱わない。

送信・owner操作・shutdownは同じmutexで直列化する。transport callbackからの同一thread API再入は即時拒否し、待ち合いを作らない。停止は既に進行中の有限exchangeが終わるまで待ち、CASが古ければ拒否して新revisionで再試行する。停止成功後に新規送信は開始しない。網側closeが不明ならunknownを残す。瞬時の物理切断やcarrierの既送分取消は保証しない。実transportの最大応答時間・block解除は実機受入事項。

## 検証・残作業

```sh
python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tethering -p 'test_*.py'
node --test tests/avocado-mini-tethering.test.mjs
npm run mission:check
npm run design:check
npm run verify
```

256byte/1KiB/16KiB、JP/US profile分離、chunk欠落/逆順/重複/改変、ACK消失・不正、有限再送、期限、復旧、同時dispatch、CAS、失効再許可、共有量/費用枠、停止競合、受信保存引渡しを無線なしfixtureで検証する。合成値を契約価格・速度・稼働時間の実測へ転用しない。

次は選定modemの実host interfaceと国別carrier契約に合わせた具体transport、Broker/AP認証入口、有限scheduler、常駐sweep、Job保存引渡し、国別鍵と暗号化・rollback保護を接続する。国別機材・契約・hard capが確定するまで実RF/有料通信を開始しない。DHCP/DNS/RA/NAT/routeやWi-Fi実handshakeと、光学4条件の受入も別途必要。

## Broker・APと常駐制御

`message_service.py` の `MessageService` は既存 `ServiceAccessPrincipalAdapter` を使い、固定consumerのowner/deviceをMiniのpolicyへ照合する。requestはBearerを毎回検証し、workerも周期・送信ごとに同じServiceAccessのguardを再評価する。既存ServiceAccessは公開fixture tokenと合成端末を受け付ける開発系列であり、実契約の本人認証ではない。料金holdや現在のpaid policyを変更しない。試験だけ明示free policyを使う。

信頼されたOS bootstrapが同一ServiceAccessController、MessageAdapter、ManagedAP、modem観測関数を渡す。`PYTHONPATH` に `systems/rock-star-os/os` と `src`、このディレクトリを含める。公開requestは `status/enable/stop/enroll/revoke/enqueue` のみ。変更にはrevision、enqueueにはAP認証済みclient、requestId、kind、base64 payload、ttlが必要。owner、価格、観測値、接続先、shellをrequestから選べない。statusは本文・鍵を返さず、enroll時だけ端末別PSKを一度返す。再登録は同じbyte capを維持し、旧queueのpermissionEpochを失効させる。

`tick()` は停止中・回線断でもTTLを掃除する。1周期1〜8件をround-robinで選び、次回時刻前の再送を行わない。AP bindingを予約前・網側予約後に再確認し、既存の各attempt通信量・料金予約を使う。失敗時の予約は戻さない。観測失敗は旧link epochを閉じ、次の周期で新しい観測を要求する。再起動はAP/送信とも無効から始め、本人のenable、再認証、新観測後に未期限切れqueueを再開する。stopは現在の有限I/Oと直列化され、瞬時のRF停止を保証しない。

`serve(service, listener, stop, max_ticks=3600, interval=1)` は所有者の0700 directory内の0600 Unix socketを検査する。1周期につき最大1 request、request読取は全体1秒・100000 bytes以内、返信も1秒以内。周期数は最大86400で終端時にdisableする。supervisor再起動で勝手にenableしない。失敗は一般化した拒否だけを返し、token/本文をログへ記録しない。状態取得でもrevisionが変わるため、競合時は新statusから明示再試行する。

`LocalModemTransport` は既存OSの長さ付きUnix transportとLinux peer UID検査を使う。固定local endpointへ `mini-local-modem/1` のgrant/frameを渡し、最大3秒の応答期限とACK上限を課す。modem supervisor実装・網側hard cap・RF停止・秘密通信は別途必要。このbridgeだけで実衛星通信成功とはしない。観測関数、AP、quota transportも信頼された有限I/O実装を構成する必要があり、任意callbackやDNS停止を含む外部環境のwall-clock上限は未受入。実機systemd常駐導入・実Broker認証・実provider・Job importは残る。

試験: `python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tethering -p 'test_*.py'`。実SQLiteのServiceAccess、AP Unix socket、再起動、本人失効、予約後AP切断、TTL、再送上限、fairness、byte cap、CAS、Unix loopを検証。無線/請求/日米の認証・契約は未実施。Mini単体、板・膜なし、少ない表示部、上下を含む全範囲、まぶしくしない条件を保持する。
