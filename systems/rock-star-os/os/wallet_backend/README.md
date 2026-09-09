# Remote Wallet — optional development authority

この構成では、端末の Wallet service をbackend上の Wallet 台帳への HTTPS proxy に切り替え、別プロセスの backend が台帳・同意・月次 scheduler を所有する。端末には authority の識別、要求と応答の控え、最後に同期した表示用 snapshot だけを保存する。端末の cache から残高を増減したり、別のローカル台帳で請求を代行したりしない。

対象は **公開 Alice fixture 1契約・1台帳の開発シミュレーター**。任意のbound v2構成では同じownerの複数購入端末をこの契約へ結び付ける。金額はすべてテスト用 USD cents で、月額は **888 cents = USD 8.88**。公開cloud、実金融provider、本番の本人確認・秘密token・passkey認証・実売上・現金ATMには接続していない。TLS証明書・鍵とtokenは明示された公開fixtureを使う。

## 複数端末のbound v2構成

2026-09-08 16:56 UTCの追加段階。`--device-credentials-file` を指定すると、同じauthorityを端末別認証へ切り替える。設定ファイルはrootまたはserver UID所有、単一linkのregular file、group/other書込み不可、symlink不可、64KiB以下。未知field、重複device_ref/token、Alice以外のowner、32端末超過を拒否する。公開テストの2端末設定は次のとおり。

```json
{
  "schema_version": 1,
  "kind": "public-development-device-credentials",
  "devices": [
    {"device_ref": "fixture-rock-arm64-001", "owner_actor": "alice", "token": "PUBLIC-FIXTURE-ENTITLEMENT-OWNER-ALICE-v1"},
    {"device_ref": "fixture-rock-arm64-002", "owner_actor": "alice", "token": "PUBLIC-FIXTURE-ENTITLEMENT-DEVICE-ALICE-B-v1"}
  ]
}
```

mappingは端末の購入資格を作らない。現在の署名済みhandoffが同じowner・有効期限内・ACTIVEであることを各HTTP読み取り/変更/receipt再送の前に照合する。Bの追加やAのsuspendは、信頼されたfixture管理側が同じ `service.membership.store.ingest` に署名eventを渡す。owner HTTPに資格発行・合成売上・ATM actorの入口はない。

bound serverは **`POST /v2/wallet`** だけを受け付け、v1を拒否する。bodyの `v` は引き続き1。既存authority headerと端末ごとのBearerに加え、単一の `X-Rock-Wallet-Device` が必要で、HTTP200には同じ端末headerを返す。端末設定は下記の従来schema1設定の `schema_version` を**2**にし、`device_ref` を追加する。`token_file` はその端末の公開fixture値を格納する。Python transportは `HTTPSWalletTransport(..., authority_id=..., device_ref=...)`。端末refはauthority/CA/tokenとともにcache fingerprintへ固定し、AのcacheをBの設定で開くことは拒否する。

serverを止め、既存ref/owner/tokenを完全に保持した設定へ新端末を追記して再起動できる。既存mappingの削除・差替えは不可で、端末停止は署名済みsuspendを使う。私有 `DEVICE-CREDENTIALS.json` はauthority UUIDと各tokenのhashを保持し、`AUTHORITY.json` に `device_bound: true` を加える。UUIDは変更しない。設定が失われる、不正になる、既存mappingと食い違う場合は旧v1/local台帳へ戻らない。二つのmarkerの間で中断した場合も現在のreaderは設定なしの再開を拒否し、元と同じ設定で処理を完了できる。切替完了後は旧readerも追加authority fieldを拒否する。完成したbound authorityのcredential履歴自体が失われた場合は、自動再作成せず明示的な回復を要求する。markerの手編集や台帳コピーによる移行手順は提供しない。

`accounts.owner_ref` の一意制約と不変の `account_devices` により、Bの登録はAと同じaccountへ追加される。旧account ID、historical primary、過去receiptを残し、schema/link/履歴の追加を同じSQLite transactionで行う。既に同じownerの旧accountが複数ある曖昧なDBは変更前に拒否する。残高だけを統合したり、旧bill/ATM hold/receiptを捨てて登録し直したりしない。

同意と取消、月額888のauthorization/billは契約全体で共有する。個々の端末のAPI資格と、いずれかの有効なlinked deviceに基づく契約の月額資格を分ける。bound modeのATM callbackは有効な登録端末Bにも同じownerのA起源holdの照合を許可するが、消費後の取消・期限切れはUNKNOWNの未確認holdを残す。要求keyはauthority内で共有される。別端末で同じ登録keyや端末bindingを含むATM keyを使うと衝突として拒否し、新しい控除を作らない。端末停止と処理の排他はadapterと**同じStore instance**のlockによる。私有DB・単一serverが前提で、外部直接SQL writerやhost侵害を防ぐ保証ではない。

bound clientは確定済みreceiptの再参照もHTTPで認証する。検証済み `unauthorized` を受けると永続 `identity.access_denied` を記録し、次のoffline起動でもWallet cacheを隠す。金融結果は不明のままなのでpending/過去receiptは保持する。完全な返答のauthority/device照合と操作別検証を通過した後だけ拒否状態を解除する。通信前からofflineなら遠隔の停止をまだ知り得ず、表示用cacheがstaleになる場合がある。以前に取得済みのbytesを遠隔消去する機構ではない。`health` はproxy起動確認で、authority同期や資格確認の証拠にはしない。

| この追加段階の検証 | 16:56 UTC時点 |
| --- | --- |
| 新しいMac実TLS/SQLite | [14件PASS](../../tests/test_wallet_backend_multi_device.py)。2端末/4同時bill要求→1account・2links・1bill・4112 available/888 billed、個別停止、再送、旧台帳保持、設定中断回復 |
| 既存Mac server試験 | [21件PASS](../../tests/test_wallet_backend_server.py)、legacy v1を維持 |
| Linux既存全体/Store関連 | 324件PASS（元snapshot内の参照。履歴資料は今回のGit対象外）は新規14件追加前。Store/adapter/bridge等71件PASS（元snapshot内の参照。履歴資料は今回のGit対象外） |
| 新1654 image既定profile | 実Platform56＋Tool45 PASS。rootfs SHA `8bbcc317f875a5fb99ee586f16f73f267f72c1a0c97fd51701721f03a66dc2e8`、固定元情報（元snapshot内の参照。履歴資料は今回のGit対象外） |
| A→B→停止済みAの実OS3boot | **結果待ち**。上のhost試験や下の旧single-device 3bootを代用しない |

元のMust全体は継続中。BlackBerry実機・実金融provider・passkey・有料サービスのentitlement連携は未達。以下の起動例とv1説明は、bound設定を指定しない従来モードの契約を残したもの。

## 従来single-device構成の検証状態

2026-09-08 時点の、この追加機能に関する証拠:

| 検証 | 結果と範囲 |
| --- | --- |
| Linux host全体試験 | **279件 PASS / 7.863秒**。保存ログ（元snapshot内の参照。履歴資料は今回のGit対象外）。実OS bootの証拠とは別 |
| 別プロセス・実TLSの継続課金 | **PASS、5 checks**。off-device-process-1510/report.json（元snapshot内の参照。履歴資料は今回のGit対象外）。Linux ARM64 / Python 3.13.5、15:09:45–15:09:46 UTC |
| Remote Wallet profileのactual OS 3boot | **PASS、3起動・7 checks**。最終report（元snapshot内の参照。履歴資料は今回のGit対象外）、終了コードとの結合（元snapshot内の参照。履歴資料は今回のGit対象外）。15:33:37–15:35:28 UTC、1531固定image。実Platform IPCによる操作で、native GUI操作試験ではない |
| 最終OSの従来local profile | **56 Platform + 45 Tool checks PASS**。通常起動（元snapshot内の参照。履歴資料は今回のGit対象外）。remoteとlocalを同じuserdataで切り替えた試験ではない |
| native同期状態表示 | **C renderer/action tests PASS**。画面（元snapshot内の参照。履歴資料は今回のGit対象外）は合成snapshotによるrendererの結果で、実guest画面の代用ではない |
| BlackBerry実機、実電源OFF、実資金 | **NOT_RUN** |

プロセス試験の「device」は Python proxy の別プロセスを指す。実OSや端末の電源断を代用しない。既存OSの別機能のboot成功も、このremote profileの成功には数えない。

## Backendの起動

repository rootから実行する。Python 3.11以上、既存fixture、書込み可能な新しいstate先が必要。以下は起動方法の記載であり、この文書の作成による起動や公開は行っていない。

```sh
PYTHONPATH=src:os python3 -B -m wallet_backend.server \
  --bind 127.0.0.1 --port 9445 \
  --state work/wallet-backend-example/server
```

初回は未使用のstate先を選ぶ。再起動時は同じ専用stateを指定する。serverは `AUTHORITY.json` に canonical UUID v4 を保存し、起動時に次の形式で表示する。

```text
ROCK_WALLET_BACKEND_READY https://127.0.0.1:9445 authority_id=<このstateのUUID> PUBLIC_FIXTURE_ONLY
```

このUUIDをclient設定に固定する。別stateを作ると別authorityになり、同じhost・port・公開tokenでも既存clientの接続先として代用できない。

既定値と任意引数:

| 引数 | 動作 |
| --- | --- |
| `--state` | 必須。backend専用の新規state、またはそのbackend自身の再起動先 |
| `--bind` / `--port` | 既定は `127.0.0.1:9445`。loopback以外を拒否。`localhost`も実際のbindは127.0.0.1。port 0は検証用の自動割当て |
| `--provisioning-file` | 既定は `os/entitlement/fixtures/device-handoff.json`。現在はAlice fixtureの引渡しに限定 |
| `--cert` | 既定は `os/registry/fixtures/development-ca.pem` |
| `--fixture-key` | 既定は `os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem`。既存の公開開発鍵 |

serverは既存 [WalletService](../platform/service.py) と [DeviceWalletAdapter](../entitlement/device.py) を利用する。新しい残高計算や請求台帳は実装していない。state directoryは実行UID所有・0700、台帳・marker・lockは所有された0600の単一link regular fileを要求する。既存のdevice台帳をmarker無しで持ち込むことは拒否する。markerを手作りして移行する手順は提供していない。

authority lockで同じstateの複数writerを拒否する。SIGINT / SIGTERMによる正常終了はHTTP処理の終了とscheduler停止を待ってから所有lockを解放する。通信deadlineが切れただけで進行中のDB commitが取り消されたとは扱わない。

## 新しい端末だけにremote profileを設定する

OSの [service起動分岐](../platform/service.py) は `/etc/rock-wallet/backend.json` がある場合だけremote構成を選ぶ。設定がなければ従来のlocal Walletを使う。[install-target.sh](../platform/install-target.sh) はclient moduleを同梱するが、remote設定・owner token・backend serverを自動設定する処理ではない。

**初回Wallet起動前の新規userdata**に設定する。`/data/wallet/wallet-simulator.db` または `/data/wallet/entitlement.db` が既に存在する場合、`configured_service` は切替を拒否する。既存のlocal profileを起動した後に設定だけ足す方法、台帳のコピー、暗黙の移行・同期・local fallbackはない。設定が存在するが不正な場合も、local Walletへ自動で戻らない。

設定は次の6項目を正確に含むJSON。未知項目を追加できない。

```json
{
  "schema_version": 1,
  "mode": "development-remote-authority",
  "origin": "https://10.0.2.2:9445",
  "authority_id": "11111111-1111-4111-8111-111111111111",
  "ca_file": "/usr/share/rock/development-store-ca.pem",
  "token_file": "/etc/rock-wallet/PUBLIC-OWNER-FIXTURE.txt"
}
```

上のUUIDは**説明用の置換対象**。起動したbackendのREADY行または既存 `AUTHORITY.json` の実値を使う。空値、別のauthority、生成し直したUUIDを設定しない。

`10.0.2.2` はQEMU user networkからそのLinux hostへの接続先として使う開発用alias。host上のproxyプロセスは `https://127.0.0.1:9445` を使う。clientが受理するhostは `127.0.0.1`、`localhost`、`10.0.2.2` のみ。backendはloopbackで待ち受けるため、このaliasが使えるguest network構成を別途用意する必要がある。NIC無しでは新しい同期・操作を送れない。

owner token fileの内容は [entitlement/protocol.py](../entitlement/protocol.py) の `PUBLIC_TOKENS['alice']`、現在の公開テスト値 `PUBLIC-FIXTURE-ENTITLEMENT-OWNER-ALICE-v1`。registry投稿用tokenやrunner用tokenとは別。実利用者の秘密tokenとして扱う値ではない。

config、CA、tokenはrootまたはWallet実行UID所有のregular fileで、group/otherによる書込みを禁止し、Wallet UID 1003から読めるようにprovisionする。例としてconfig/tokenをroot:1003・0640、親directoryをroot:1003・0750にできる。シンボリックリンクを使わない。CAは読取り可能な既存fixtureを利用する。接続設定が失われても、`backend-cache` のdirectory・file・壊れたsymlinkが残っていればローカルWalletの作成を拒否する。元の固定設定を復元するまでWalletを開始しない。設定とcacheの両方を失った場合の端末履歴復元・移行は未実装。client cacheは `/data/wallet/backend-cache` にWallet UID自身が作成・所有する0700 directoryと0600 filesになる。

proxyをOS外で使う場合のPython入口は `HTTPSWalletTransport(origin, ca_file, token_file, authority_id=...)` と `RemoteWalletService(state_dir, transport)`。`dispatch(request, peer_uid=1002)` を呼び、終了時に `close()` する。OSではpeer UIDはUnix socketの認証情報から渡り、JSON bodyで指定できない。rootとPlatform UID 1002以外を拒否する。`close()` 後の古いobjectからの操作も拒否する。

## 通信・要求・返答の契約

HTTP APIは **`POST /v1/wallet`**。`Content-Type: application/json`、単一の `Content-Length`、`Authorization: Bearer <公開Alice fixture token>`、単一の `X-Rock-Wallet-Authority: <固定UUID>` が必要。serverは要求側UUIDを照合してからdispatchし、clientも返答側の同headerが固定UUIDと一致することを確認する。

TLSは1.2以上、明示CAとhostname検証を有効にする。origin・authority UUID・CA内容hash・token内容hashをまとめたfingerprintをclient cacheに固定する。そのいずれかの変更は既存cacheのauthority変更として拒否し、明示的なrecoveryを要求する。鍵やtokenのrotation、台帳移行の一般運用機能は未実装。

要求bodyは64 KiB以下、返答は1 MiB以下、mutation keyは1–128文字。JSON重複fieldと非有限値を拒否する。serverはheader budget 16 KiB、同時処理上限12、既定のconnection deadline 15秒。clientの既定deadlineは1秒で、Python constructorでは0.05–3秒に限定する。途中で切れた返答や期限切れから操作結果を推定しない。

| owner操作 | `v: 1` と `op` 以外の必須field |
| --- | --- |
| `snapshot`, `health`, `wallet.membership`, `wallet.billing.status` | なし |
| `wallet.register` | `key` |
| `wallet.consent` | `key`, boolean `accepted`, `terms_version` |
| `wallet.bill` | `key`, `period` |
| `wallet.atm.issue` | `key`, `amount_minor`, `atm_id` |
| `wallet.atm.status` | `withdrawal_id` |
| `wallet.atm.history` | `limit` |
| `wallet.atm.cancel`, `wallet.atm.expire`, `wallet.atm.timeout` | `key`, `withdrawal_id` |

ownerは `wallet.sale`、`wallet.settle`、時計変更、ATMのredeem/dispense/reconcileをHTTP経由で実行できない。入力fieldによるowner/device/peerの差替えもできない。標準のHTTP APIにはテスト売上を作る入口もない。

登録は引渡しfixtureの確認情報を引き継ぎ、登録だけで月額同意や引落しはしない。継続同意は `accepted: true` と `terms_version: "simulator-monthly-usd-8.88-v1"` を明示する。取消しも `accepted: false` と同じtermsを持つ独立した要求にする。`wallet.bill` の成功返答は請求scheduleの**受付**であり、支払完了ではない。実際のテスト請求は `wallet.billing.status` とbackendの台帳・bill receiptで照合する。schedulerはbackend processが稼働している間にUTC暦月の処理を進める。

## Offlineと結果不明からの回復

clientの `remote-cache.db` には `identity`、`requests`、`snapshot` の3tableを保存する。残高を更新するローカルWalletは作らない。要求bodyと確定済みreceiptは変更不可。新しいmutationを受け付ける前に、未解決のmutationがないことを確認する。

| 状態 | 動作 |
| --- | --- |
| 接続でき、snapshotが有効 | 表示用cacheと同期日時を更新。`connected: true`, `stale: false` |
| 初回からofflineで有効cache無し | 利用可能な残高を作らず、`BackendUnavailable` |
| 同期後にofflineまたは不正snapshot | 最後の有効cache・金額・同期日時を保持し、`connected: false`, `stale: true` |
| 新しい要求がHTTP送信開始前に失敗 | `NotSent`。その新しい要求を未受付としてqueueから除く |
| 送信後の切断、ACK消失、不正または要求と一致しない返答 | exact keyとpayloadをpendingで保持。成功・確定拒否へ変換しない |
| pending中に別mutation | 送信せず拒否。取消しpendingを新しい同意要求に置換しない |
| `snapshot`等で再接続 | 保存済みpendingを**同じkeyとpayload**で先に照合し、その後snapshot取得。backendの既存receiptへ収束させる |
| 同じkey・同じbodyの確定要求 | legacy v1は保存済みreceiptを返す。bound v2は同じ要求をHTTPで再認証し、完全一致したreceiptだけを返す |
| 同じkey・異なるbody | clientで拒否 |

pendingの再送が `NotSent` になっても、以前の送信結果はまだ不明なのでpendingを消さない。自動照合はsnapshot／membership／billing statusの取得時に行う。client単独の常時再送daemonではなく、`health` も接続・台帳同期の確認にはならない。

確定拒否として保存するのは、検証済みの `ok: false`、`code: rejected` またはlegacy v1の `unauthorized`、文字列errorを持つ返答。bound v2の `unauthorized` はアクセス拒否としてcacheを隠し、以前の金融操作が失敗したとは判断せずpendingを残す。transportはHTTP 200、または400/401/403/409/422の対応する拒否bodyを受け取り、それ以外のHTTP statusを結果不明として扱う。`unavailable`や未知codeもpendingを保持する。成功返答も `simulation_only: true` と操作別の対応関係を検査し、別の同意値・月・要求key・ATM・金額等の返答を受理しない。

cache表示には `last_sync_unix`、`pending_reconciliation`、`cache_is_spendable: false` を付ける。古い残高は支払や出金の許可にならない。ATMの現在状態／履歴要求は表示用snapshotから補わず、backendに接続できなければ拒否する。receipt上限10,000件に達すると新しいmutationを止め、保存済みexact要求の再参照は残す。

## プロセス証拠の再現

repository rootから、**未使用の出力directory**を指定する。すでに保存した証拠や8時間時点の固定outputsを指定しない。

```sh
PYTHONPATH=src:os python3 -B -m wallet_backend.verify_off_device \
  --output work/wallet-backend-proof-new-run
```

このverifierは専用のbackendとproxyを別プロセスで起動し、空きloopback portと実TLSを使う。台帳とcacheは専用一時directoryに作成し、正常終了後に削除する。保存する証拠は指定directoryの `report.json`。既存backendを利用したり停止したりしない。

clock変更と合成売上の精算は、verifierが所有するprivate multiprocessing pipeから既存WalletServiceを呼ぶ試験専用操作で、HTTP endpointやOS配布物には追加していない。通常のserver CLIには `--clock` や売上注入flagはない。

1510の保存済み結果は次のとおり。

| 段階 | 合成残高 / 請求累計 | 確認 |
| --- | --- | --- |
| 登録後 | 月額請求0 | 登録は継続同意を含まない |
| 合成USD50精算・9月同意後 | 残高4112 / 請求888 cents | schedulerが9月分を1回処理 |
| proxyを正常終了し10月へ進める | 残高3224 / 請求1776 cents | backendだけで10月分888を1回処理。proxy PIDは終了済み |
| 同じbackend stateで再起動 | 同じ残高・同じ2件のbill | authority UUIDと台帳を保持し、追加請求なし |
| proxy再起動・取消し・11月へ進める | 残高3224 / 請求1776 cents | 再接続でbackendの結果を表示、取消し後の11月請求なし |

各段階のholdは0、台帳合計は0。報告にはprocess終了状態、bill ID、期間、金額、authority UUID、source hash、検証中のsource不変確認が含まれる。このrunは正常なprocess終了と再起動の試験であり、突然の電源断、backend自体が停止している間の実行、外部金融決済の証明ではない。

全体試験の再現入口は `PYTHONPATH=src:os python3 -B -m unittest discover -s tests -v`。個別の境界は [client tests](../../tests/test_wallet_backend_client.py)、[server tests](../../tests/test_wallet_backend_server.py)、[integration tests](../../tests/test_wallet_backend_integration.py) を参照。実OSの3boot証拠は上表の最終report・invocation・停止済み台帳の比較で参照できる。


追加の実TLS境界試験では、登録・同意・月次受付・取消しの4操作でbackend処理後のHTTP本文を途中切断した。proxy再起動後も同じkey/bodyを照合し、backendの同じ受付へ復帰する。月次受付ACKが届く前にbackendが888 centsを処理済みでも再控除はなく、最終残高4112・bill1件・取消済みを確認した。これはLinux上のTLS client/server試験であり、QEMU内の通信断試験とは区別する。7件のprofile選択試験はOS init同様の0700保存先で、新規local/remote・設定紛失/破損・既存localの切替拒否を確認する。


## 実OS証拠の再現

Linuxの専用開発VMで、build済みのImage/rootfs.ext4/stage0.cpio.gzを含む固定directoryと未使用outputを指定する。

```sh
PYTHONPATH=src:os python3 -B os/wallet_backend/verify_os.py \
  --artifacts /path/to/frozen-images \
  --output /var/tmp/new-wallet-os-proof
```

検証器はrootfsの新コピーに公開token・authority設定・guest helper・起動hookの4entryを注入する。元imageを変更しない。同じ新規userdataでonline→NIC無し→onlineの3回起動。guest UID1000から実Platform IPCで登録・明示同意・取消を行い、root helperは保存状態の観測と通常poweroffを担当する。hostのprivate制御は合成売上精算と月の変更だけで、owner操作を代行しない。Octoberへの時計変更は第1回OSの正常停止・unmount・終了コード確認後。Novemberは第3回OSのオンライン取消完了後。

最終結果はOS正常停止3回、clean ext4、同じcache3table、backendとdeviceの同じ3receipt、888×2のbillと残高3224を照合する。保存されたreportだけでなく、verifierの終了コード0・最後のstdout PASS・そのSHA・report SHAを結合して採用する。試験用派生rootfs/userdata/authority DBはVM内に保持し、公開証拠・配布imagesには含めない。BlackBerry対応・実provider・本番信頼・GUI操作の検証には換算しない。


### 2026-09-08 17:09 UTC 検証結果の確定

上記の3boot結果待ちを更新: `os/wallet_backend/evidence/multi-device-os-20260908T1704Z` は17:04:42–17:06:55 UTCの実OS A/B/失効AでPASS。正常終了3回、clean ext4、同一契約と888一度・B取消、Aのcache非表示/再送拒否、別bill keyのHTTP送信0、停止済み正本とのreceipt一致を確認した。GUI/実認証/実機の証拠とは分ける。最終Linux全体338＋契約関連71＋ATM40がPASS、計449実行、最終ログにskip/例外/警告なし。詳細はCHECKPOINTおよびE2E結果を参照。全Mustは未達でGoal active。
