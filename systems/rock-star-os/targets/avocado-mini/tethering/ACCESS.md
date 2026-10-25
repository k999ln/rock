# Mini AP認証・網側上限の共通adapter

MAT15 / M1 / ROCK、MINI-08の続き。2026-10-25の本人回答「事業者・modemは未定、共通adapterと試験を先行」に基づく。PR212はmain `41ee45d7fce8390b27c59110cc282f695f898122`へ統合し同SHAの13 CIが成功した。今回の追加はAP制御protocol、網側上限protocol、Linux転送の結合で、実無線・衛星・請求の合格ではない。

Mini自身のアンテナ/modem・Wi-Fi・電池で携行する設計を維持する。板・膜なし、少ない表示部、上下を含む全範囲、まぶしくしない条件と光学原本は変更しない。

## 利用と責任

本人が端末を登録すると、端末ごとにランダム256bitのPSKを一度だけ保護された応答で受け取る。ownerを確認したBrokerの内部呼出しが前提で、本人UIや公開IPCはまだない。鍵をログ、Git、通常snapshotへ入れない。鍵を失った端末は本人が失効させる。接続済み端末、送受信量、未確定予約、料金上限、確定請求を区別する。未確定予約を空き枠として再利用しない。

ROCKが鍵生成/保存、AP子process、認証状態確認、通信予約とLinux制御を担当。EXTERNALが無線driver・衛星modem/アンテナ・実料金/網側強制を提供。JOINTで同一筐体・回線契約の受入を行う。OWNERが回線、地域、期間、端末、量、金額を承認する。事業者の既存APIを装った実装や自動契約・実課金はない。

## 管理APIと許可順序

`AccessSession(gate, ap, network)` は既存ControllerとLinuxGateを再利用する。全操作をgateのmutex/owner/CASの内側へ直列化する。rootが下位objectを直接呼ぶ境界はtrusted管理側であり、外部へ公開しない。

| 呼出し | 結果と失敗時 |
| --- | --- |
| enroll(owner, revision, binding, byte_cap) | 本人許可、端末固有PSK、固定interface/MAC/IPを結ぶ。再配布/重複鍵・MAC/IPを拒否 |
| enable(owner, revision) | 古い転送を閉じ、網側accountの上限を確認しAPを開始。失敗時にAP子processも停止 |
| observe(owner, revision, observation) | 古い転送を閉じ、網側accountとhostapdの認証済み端末を再観測。電池/温度/modem/IP/契約地域の観測は別trusted adapterが必要 |
| open(owner, revision, grant_id, client_id, bytes) | 認証→local予約commit→remote attempt fsync→網側予約確認→再認証→nft install。応答喪失/不一致では開かない |
| close(owner, grant_id) | local ruleを除去して網側close。最終請求とせずlocal予約保持 |
| stop(owner, revision, client_id / dock_id) | local停止、AP停止、網側unknown/reservedのcloseを独立試行。各確認結果、providerUnknown、台帳読取成否providerJournalKnownを返す。離脱後は新観測と本人再開が必要 |

端末の切断は次の認証確認で拒否する。daemon停止中もkernelのbyte/期限上限が残る。無線イベント常時監視や瞬時失効を実装済みとはしない。短いleaseの更新loop、管理UIへの状態提示、実modemの観測は次の接続作業。

## hostapdの所有・鍵・停止

`ManagedAP` はprivate 0700 directory/0600 registryに端末別PSKを保存し、hostapdへWPA2-PSK/CCMP、PMF必須、AP isolation、WPS/WDS無効、初期停止のconfigを生成する。MAC ACLだけで本人性を認めず、固有鍵とhostapdのAUTH/ASSOC/AUTHORIZED/MFP状態を確認する。登録鍵を共有PSKへ変換しない。鍵を複製された端末まで識別できる方式ではない。

`OwnedHostapd` はroot Linuxで `/usr/sbin/hostapd` を専用namespace内のforeground子processとして起動する。既存socket/daemonを採用せず、生成config/PSKのhash、子process生存、socket inodeを世代として照合する。資格情報変更は自分のprocessを止めて新しく起動し、RELOADだけで読込元を推測しない。子processはgate lockを継承し、専用launcherでLinux parent-death SIGKILLを設定する。親が消えた後にAP子だけ残り続けない。起動前の所有intentと起動後socket inodeをfsyncし、AP lockも子へ継承する。再起動でgate/AP lockを取得した後、同じ所有者・namespaceの記録とsocket型/UID/既知inodeを照合した残骸だけを回収する。未知socketは拒否する。停止確認が取れない場合は成功にしない。

製品ではrootが管理するコード/実行binary、短いprivate control path、pinned namespace、適合するcountry/channel/bandを準備する。radio profileはインストール設定で、一般client入力にしない。法域/driver適合、hostapdの実WPA handshake/隔離、BSP offload、鍵保護storageは機種ごとに受入が必要。現試験のReferenceAPはUnix datagram protocol fixtureで、無線認証の暗号処理を実証しない。

## 網側quota protocolと料金上限

`NetworkQuota` の `mini-network-quota/1` は新しい共通契約。実事業者が対応済みとはしない。HTTPSの固定 `/v1/mini/quota` へaccount/reserve/read/closeだけを送る。TLS証明書とhostnameを検証し、redirect/retryをせず、送受信長を制限する。さらにrequest/response別HMAC-SHA256、nonceを含むrequest hash、全policy hash、短い観測期限を確認する。鍵はruntime secretである。

**必須の網側契約**: period全体で送受信・再送・overhead・未要求downlinkを含むhard byte/cost capが事前設定され、管理channelは課金免除であること。全trafficの料金上限を網側で強制できない回線は起動しない。account cap、currency/単価/期間/契約は承認policyへ固定し、reserveで上限を上げない。local受信dropを料金停止と呼ばない。

local予約の全grant内容をhashで固定し、網側grantの最大量/最大費用/期限と照合する。account/grantの計量巻戻し、同revision矛盾、改変、期限切れ、上限超過を拒否。署名のある矛盾は永続faultとなり、新規通信を再起動で復活させない。確認できないcloseはproviderUnknownに残す。

reserveは送信前にunknownを永続化する。ACK喪失時に自動reserve再送やlocal再installをせず、同IDのread/closeで復旧する。期間終了後も照会/停止は可能。網側でunknownが見つからなくてもlocal予約を解放しない。最大128 grantまたは64KiB journalで停止する。原子的保存は一意の一時名→fsync→rename→directory fsyncとし、クラッシュ残骸で次の保存を妨げない。残骸は自動で台帳に採用せず、停止中に管理者が保護下で整理する。

台帳削除・巻戻し、fault解除、period rollover、最終請求照合と予約精算を自動化しない。Brokerの同一gate所有権/直列呼出しが前提。managed TLS経路とcontrol namespaceの分離を設計する必要があり、現Linux gateはinput/output default denyを維持する。

## 再現と受入境界

```sh
python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tethering -p 'test_*.py'
# 専用Linux VMのみ。既存radioや外部回線を使わない。
sudo python3 -B systems/rock-star-os/targets/avocado-mini/tethering/linux_packet_test.py
```

host試験はUNIX control、個別鍵/PMF状態、世代、TLS、署名、hard cap、計量、ACK喪失、期限後照合と復旧を対象にする。TLS試験鍵は一時directoryで生成/削除し、実運用鍵と別。Linux試験はveth実packetの認証→網側予約→nft経路、IPv4/IPv6、単体携行再開、失効、provider障害と独立停止、親死亡時の子終了を検証する。さらに実hostapd 2.10を試験専用driver=none（RFなし）で起動し、親kill、socket残留、同所有者再起動、停止と未知socket拒否を確認した。端末認証状態とproviderはfixture、無線WPA handshake・実網・実請求は未受入。証拠は `docs/evidence/development-execution/mini-08-access-adapters.json`。

## 実現へ進む受入順

1. 本人が求める可搬寸法・稼働時間・通信用途を既存R5条件へ結び、双方向IP/共有許諾/網側上限のある契約とmodem・アンテナ候補を比較する。条件に合う機器/契約が未確定なら実回線readyにしない。
2. 対応Wi-Fiチップでhostapd・固有鍵・PMF・端末間分離を試し、DHCP/DNS/IPv6 RA、NAT/経路、管理面、modem登録/切断、lease更新loopを限定APIへ接続する。
3. 同一試作機で衛星疎通・遮蔽・熱/消費電力・電池・持出し/再起動を測る。外部terminalの成功をMini単体の成功にしない。
4. 網側上限の飛越量、未要求受信/再送、管理費、期間境界と明細をprovider試験環境で照合してから、指定契約/機体の実回線試験へ進む。通信実機受入と表示4条件の光学受入はそれぞれ必要。

根拠: [hostapd control interface](https://w1.fi/hostapd/devel/ctrl_iface_page.html)、[hostapd config](https://android.googlesource.com/platform/external/wpa_supplicant_8/+/master/hostapd/hostapd.conf)、[Python HTTPSConnection](https://docs.python.org/3/library/http.client.html)。機能文書の存在を実機合格へ転用しない。
