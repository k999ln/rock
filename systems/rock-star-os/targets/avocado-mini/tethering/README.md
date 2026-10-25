# Mini 単体の衛星 → Wi-Fi 共有制御

MAT15 / MINI-08 / NET01・DP02/03/05。2026-10-25の本人指示「Mini自身が衛星回線につながってWi-Fiを配る、ドックから外しても単体、接続端末・通信量・料金上限管理」を具体化する。主担当はMaterial Invention / avocadoMiniのROCK。既存の[携帯通信設計](../../../../../docs/avocado-mini-r5/embedded-portable-connectivity.md)と[通信・請求の共通設計](../../../../../docs/service-design/08-mini-connectivity-and-billing.md)を使う。

成果は **Python/SQLiteのhost制御prototype** と、[Linux packet gate](LINUX.md)の隔離namespace実パケット試験。modem、Wi-Fi無線、本人認証UI、Provider請求には未接続。実衛星通信・携行電池・全Mini完成ではない。板/膜なし、少ない表示部、上下を含む全範囲、低眩しさの既存条件を保持し、光学sourceは変更しない。

[AP認証・網側上限adapter](ACCESS.md)を追加。本人が許可した端末の固有鍵/認証状態と、HMAC/TLSで確認する網側予約をLinux転送前へ接続する。事業者・modem未定の共通protocol/試験であり、実無線・実請求の受入は別。

[小容量メッセージadapter](MESSAGES.md)は日米のsi・メッセージ・小ファイルを有限分割・再送・TTL・共通byte/cost予約で制御します。既存の開発用Broker本人確認とAP認証を使うMessageService、有限tick、private Unix入口も実装しています。無線なしfixtureの実装であり、実Broker本人認証・実modem/網側課金との接続は未受入です。

## 利用体験と構成

```text
衛星網 ⇄ Mini内アンテナ/RF/modem ⇄ OSの制限付きpacket path ⇄ MiniのWi-Fi AP ⇄ 許可端末
                                        ↑
                       共有制御 + ownerの承認 + 永続利用枠
                       ↑                ↑
                 電池/温度/dock     ローカル管理画面（次段階）
```

同じMini coreが全経路を持つ。ドックは保持・給電・場所の情報を担う。スマホ、PC、外付け衛星terminalや演算Hubを必須にしない。屋内遮蔽や電池不足ならWi-FiとWANの状態を分け、インターネット利用可能と表示しない。

本人は、回線・通貨・料金条件の版・承認期間・総通信量上限・料金上限を確認して共有をONにする。接続要求一覧で端末を許可/失効し、端末ごとの通信量上限を設ける。表示は「観測した送受信量」「結果不明の予約量」「費用の保守的上限」「Provider確定請求」を別項目にする。未観測を0や接続済みに変換しない。許可端末と現在接続中の端末も別である。現prototypeにUIはなく、同じ操作をAPI試験する。

## 責任と既存systemの再利用

- ROCK: controller.pyの制御状態、所有者照合、revision競合拒否、SQLite事前予約/保存、停止、期限、復旧。Linux namespace packet adapterを限定実装。実AP/modemと共通owner UIへの接続は次段階。
- EXTERNAL: 内蔵衛星modem/アンテナ、BSP、AP driver、回線の共有許諾と料金定義、Providerの上限/計量機能、電池と熱。
- JOINT: 同じ本体/契約で双方向IP→client HTTPS疎通、遮蔽、切断、課金境界、電源着脱、再起動を測定。
- OWNER: 共有対象、回線、期間、容量と費用の上限を承認。購入・契約・実課金の実施はこのhost試験に含めない。

共通の[本人/仕事/料金設計](../../../../../docs/rockstaros-complete-design.md)と[請求契約](../../../../../docs/sky-billing.md)を保持する。Rootの未統合source `packages/rockstaros-runtime`、`lib/sky-usage-observation.ts`、`lib/sky-usage-payment.ts`も比較読取したが、このmain候補の実装依存にしていない。このDBは通信の予約台帳だけで、Wallet残高、Agent usage、Invoice、商品料金を作り直さない。Agent API費用をこの通信枠で承認しない。共有契約のschemaやAPIを変更しない。`ownerId`はBrokerの認証結果、clientIdはAP側の認証済み接続を指すopaque IDで、MAC/IPの自己申告を本人性としない。

## 入出力と実装API

標準PythonとSQLiteだけで動く。DBはowner/device/承認periodに固定し、初期化後に上限・単価・通貨を変更しない。`Controller(private_directory)`は0700 directory/0600 DBを使い、symlinkや公開権限を拒否する。OSの保護storage/鍵/rollback保護の代用ではない。

| API | 呼出元と意味 |
| --- | --- |
| initialize(policy, now) | Brokerの承認済み構成を一度だけ保存。初期OFF。外部からpolicyを自己申告させない |
| owner_command(authenticated_owner, revision, command, now) | allow/revoke/reallow/enable/disable。認証ownerはJSONではなくBroker文脈から渡す |
| observe(revision, observation, now) | trusted adapterだけ。boot/link/契約/地域/両方向IP/到達/AP分離/計量/強制quota/電源と接続端末一覧を、最大60秒のleaseで観測 |
| attachment(revision, dock_id, now) | 装着/離脱で場所scopeと古い通信観測を失効。本人、端末許可、上限、観測量と予約を保持 |
| reserve(revision, grant_id, client_id, max_bytes, now) | packet adapterだけ。送受信合計の最大byteと費用上限を原子的に予約。commit後にのみgrantを返す |
| can_forward(grant_id, now) | grant/epoch/期限/owner設定/観測がまだ有効か判断。これ自体はpacket送信/遮断を実行しない |
| settle_closed(revision, grant_id, tx_bytes, rx_bytes, now) | adapterがtokenの閉鎖と最終counterを読戻した後のみ実行。観測量を1回記録。不明なら呼ばず予約を残す |
| recover(revision, now) | 起動時、packet pathを閉じたまま先に呼ぶ。共有OFF・再観測・本人再開。旧予約と利用量は残す |
| snapshot(now) | 内部向け状態/接続一覧/観測量/予約/残枠/理由。公開APIへそのまま返さずownerで認可 |

`revision`は全変更でCAS、SQLite `BEGIN IMMEDIATE`とFULL同期を使用。競合時はsnapshotを再取得し、同grant IDで結果を照合する。grant ID再送は同内容ならreadbackを返すが`installAllowed=false`で再送許可を作らない。内容変更は拒否。DB read/write/commit失敗時はgrantを返さない。DB破損や欠損を自動初期化しない。初回initializeと復旧は管理側が区別し、同periodのDBを削除/再作成して上限を再利用させない。

## byteと料金の境界

全量は送信＋受信、端末横断の総上限と端末別上限の両方で制限する。予約中も全額/全byteを上限から引く。grantは最大60秒、policy/観測期限を越えない。実際の最大grant量は承認policyで指定する。period内の登録IDは最大64、grant記録は4096で打ち止め。削除や無制限の履歴蓄積はしない。大きなperiodの圧縮・rolloverは次段階で、limit到達は停止と表示する。

料金計算は `ceil(maxBytes / blockBytes) × blockPriceMinor + grantFeeMinor` の整数 **承認済みall-in最大値**。試験のUSD/単価は架空で、実Provider価格ではない。丸め単位、最低料金、再送、制御通信、税/外部実費まで含めた上限が未確定なら実adapterでreadyにしない。価格0/欠損/負/小数/過大整数は拒否。通貨変換をしない。

settle後も予約した費用上限全体を消費扱いにし、このprototypeでは差額を返さない。実請求とは別なので`invoiceVerified=false`を維持する。未確定やtimeoutの予約は期限切れでも戻さない。最終counterが予約byteを越えたら異常を保存して共有を停止し、報告されたoverrun値と予約を残す。再起動でfaultを消さない。

**端末で受信後にdropするだけでは衛星課金上限を保証できない。** 未要求downlink/再送/registrationなどもProvider側で課金され得る。現モデルの`hardQuotaReady`はtrusted observationの信頼境界であり、Linux namespaceのbyte quota検証を実網のhard capや実課金保証へ昇格させない。実AP/modem・Provider計量adapterは未接続。実装接続前に、網側のhard cap/最悪飛越量、protocol overheadを含む総量の上界、全local流量を同じ契約へ計上する経路を確定し、上界を予約に含める。これができない回線を「料金上限保証済み」で起動しない。

## 停止・再起動と着脱

失効、OFF、boot/link変更、観測更新、離脱でepochが変わり、旧grantは使用不能。新観測後も旧grantを復活させない。owner再許可は端末の累積量をリセットしない。上限到達で新grantを拒否しても、既に予約済みの有効grantはその枠内だけ利用できる。

LinuxGateでは専用namespaceの起動時default deny、共有packet quota、kernel期限、daemon終了後の制限を実装・試験済み。clockの信頼性、実AP/modem/BSPへの接続と実機watchdogは別受入が必要。Pythonを周期実行して数秒後に遮断する方式では厳密な上限を保証しない。付け外し時は古いtokenを閉じてcounterを観測し、最終確定できない予約は保持したまま、電池/温度を再観測して新epochで再開する。owner/jobは継続し、場所の設備操作scopeは自動復活しない。衛星TCP sessionの無切断は保証しない。

## 実adapterの実装境界

AP認証は[hostapd公式](https://www.w1.fi/hostapd/)の対応機能を採用候補とし、[設定source](https://android.googlesource.com/platform/external/wpa_supplicant_8/+/master/hostapd/hostapd.conf)のstation isolationを含めてexact driverで検証する。packet filterの候補は[nftables公式manual](https://netfilter.org/projects/nftables/manpage.html)のcounter/quota/set期限。既存仕様の存在はMiniでの作動証拠ではない。上記資料は2026-10-25に確認した。

LinuxGateはroot用任意shellを公開せず、固定schemaのプロセス内APIでtoken install/close/readbackを受ける。認証済み固定IPCとBroker/AP接続は未実装で、次段階に実装・検証する。token IDの二重installを拒否し、maxBytes、boot/link/epoch、owner/client binding、期限、IPv4/IPv6の全経路を照合する。forward既定拒否、LAN-to-LAN/管理面分離、DHCP/DNS/IPv6 RAの境界、確立済みflow/offloadによるquota回避、packet粒度のovershoot、conntrack、APの偽装/再接続、管理系自身の衛星使用も試験する。Linux network namespaceのpacket試験→driver/AP→modem sandbox→同一閉箱と段階を分ける。radioやroot設定をhost試験から勝手に変更しない。

## 再現と合格条件

repository rootから:

```sh
python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tethering -p 'test_*.py'
node --test tests/avocado-mini-tethering.test.mjs
python3 -B systems/rock-star-os/targets/avocado-mini/tethering/demo.py
```

demoは一時private DB上の架空回線/端末だけを使い、ネットワークを操作しない。接続許可→持ち出し→送受信計量→上限拒否→再起動後の予約保持を出力する。

ROCKの限定合格条件は正常経路、未認証owner/未知端末、共有不可、短文のみ/片方向、期限/時計/電池/温度、総量/端末量/費用、並行予約、再送、counter衝突/overrun、停止/着脱/再起動、DB private権限の負例成功。同じhashの独立検収、全verify、main/CIは別欄で記録する。

実受入の未決定は内蔵modem/antenna/契約/地域別共有条件、閉箱での電源/熱、AP chip/BSP、client認証/鍵、quotaの下位強制、Provider receiptと請求照合。既存DP02〜05を同じ試作個体で測定して決める。最終ハード採用、購入、一般公開、製造、請求は未実施。
