> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# Rock star os architecture — OS起動基盤と既存ホスト試作

2026-09-09 03:04 UTC: [MCPのHub統合](MCP-HUB-INTEGRATION.md)で、購入資格authority内のBrokerとOSの専用HTTPS client・native画面を結合した。通常のHub snapshotにネットワーク待ちを追加せず、本文は明示submitまで端末に残す。接続開始の永続世代と解除を直列化する。現行Linux950実行と新しい署名済みstage0ゲストの実画面による接続・同意・一件実行・解除・結果参照・通常終了がPASS。新baseと試験用派生profileのhashを別々に記録する。購入情報のfixture、無料の所有MCPサービスに限る証拠である。

01:56 UTC時点の横断変更は利用開始・操作性・接続（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。native UIの待ち時間をWallet通信から分離し、署名済みstage0の現在起動情報と購入者scopeから永続activationを作る。画面のtapをWallet登録・月額同意・サービス認可へ拡張しない。独立MCP brokerは接続世代と送信claimを直列化し、UNKNOWNを元のstatusだけで回復する。ToB settlementは個人Walletとは別の単一authority台帳で、署名された売上・精算だけを資金の根拠とする。この二moduleは当時のOSイメージや本番providerには未接続。運営planは署名済みreleaseと配布承認を分離する。実際の配信executorはまだない。各範囲のhost試験と実OS起動の証拠を別々に採用する。

製品はBlackBerry-first OSを目標とします。ユーザーの実機型番は未定です。既存のmacOS上Python HubをOS完成とみなさず、`os/` にカーネル・rootfs・OSサービスをビルドする構成を追加しました。起動の成否は `artifacts/os/` の実ビルド／ブート記録で判定します。BlackBerry用driverと実機製品は未完成です。仮想OSではnative Hub・Wallet画面が動作しています。

## OS本体の構成

```text
ARM64 QEMU virt（開発用。BlackBerryを再現した仮想機ではない）
  Linux Image → [guestで検証済みstage0のA/B選択] → 読み取り専用rootfs.ext4 → BusyBox init
    ├─ /dev/vdb → /data（永続、nosuid,nodev,noexec）
    ├─ native Hub（uid1000、Cairo/FreeType、framebuffer/evdev）
    │    └─ Unix IPC → platform service（uid1002）→ /data/platform
    │         ├─ 署名済み独立Tool → bubblewrap/user+mount+pid+net等namespace
    │         │    → seccomp、CPU/RAM/FD制限 → 有限recipe interpreter
    │         └─ Unix IPC → Wallet simulator（uid1003）→ /data/wallet
    └─ rockd（uid/gid1000、no_new_privs、診断用常駐core）
         Unix socket /run/rock/rockd.sock
           ├─ SO_PEERCREDで接続元UIDを検査
           ├─ 有限の組込み文章処理
           └─ /data/rockへ完了件数を保存
```

OSとユーザーデータを分け、初期試験はNICなしで実行します。0.1起動基盤の2boot/権限/永続化はPASS。0.2はactual ARM64 guestで46 platform checksと45独立Tool checksがPASS（artifacts/os/platform-pass-0751）。実framebuffer/evdev操作による導入・承認・入力・実行と3件の永続receiptもPASS（os/ui/evidence/target-native-0814）。これは開発用仮想ボードの証拠であり、BlackBerry実機の合格ではありません。

`/run/rock-platform/api.sock`はUID1000/0だけ、`/run/rock-wallet/api.sock`はUID1002/0だけをSO_PEERCREDで許可し、clientも接続先UIDを検査します。各DBは別UIDの0700領域。Tool sandboxには空の/dataと/runを置き、元のDB/socketをmountしません。外向きsocket、fork、namespace変更等もseccompで拒否します。これは有限recipe向けポリシーであり、任意native App実行やTEEの完成ではありません。

native IPCは1connection1JSON frame、request256KiB/response1MiB、接続deadlineと同時接続上限を適用。snapshotはJSON escapeを含むbyte予算でcatalog/job/audit/Wallet履歴を制限し、切り詰めを明示します。残高は全台帳の合計、元の結果は保持し`job.result`で取得可能。mutationとretry receiptは同一SQLite transactionへcommitし、未commit処理のworker起動をlockで防ぎます。

A/B stage0は同一Image/initramfsからguest自身がslot A/Bを選択します。署名済みmanifestとrootfs全量hash、永続attempts、health確認とwatchdogを実装し、改ざん拒否・正常更新・health失敗・init hang・watchdog復旧・途中書込電源断を含む8bootがPASS。rootはro,noloadでmountし、署名imageのjournal replayを防ぎます。healthはDBが開くだけでなく、署名catalogと隔離診断と固定recipe往復の成功を要求します。固定data ABI契約と空き容量不足時の安全なslot選択は追加中。kernel/initramfs自体のhardware secure bootや耐物理rollback、全slot喪失後の独立recovery OSは未達です。

## 署名ストアの直接取得（実OS検証済み）

開発用HTTPS registryはDebian環境のloopbackだけで公開し、guestは固定配信元と明示CAで接続します。署名indexのrevision・期限・append-only失効を確認し、全量取得したpackageのsize/hash/署名が一致した後にcacheへ保存します。TLS・認証・中断・期限・失効を含む28 testsはhostでPASS。Linux 6.18.50の実guestからSDK生成Toolを取得・更新・rollbackし、QMPによる実仮想リンク切断後とNICなしの次bootでも実行する2bootがPASS（artifacts/os/store-pass-0908、27＋6checks）。1回のrunで5.903秒の応答不明が起き、同一keyの1回再送で二重jobなしに回復した。遅延が完全解消したとは扱わない。

実framebuffer/evdev操作による検索→取得→承認→実行もPASS（os/ui/evidence/target-remote-0900）。4件のUI起点receipt、package hash、actual job output、Wallet不変を独立の読み取りobserverで照合した。09:00のGUI証拠は0853 frozen image、09:08のoffline証拠は検証再利用を追加した0908 imageという別の対象である。

`registry.refresh`はUIの待機を避けるため、Hubのretry receiptと更新queueを同じtransactionで保存して即受理します。専用workerが取得し、snapshotの状態を更新します。失敗時も旧検証済みcatalogを保持し、期限切れは新しい取得・導入を拒否します。導入済みlocal Toolの実行は通信に依存しません。更新中断は起動時に再開し、index保存とHub更新の間で落ちても、署名済み失効を起動前に再適用します。失効したpackageは再承認できません。

公開RFC test fixtureだけを信頼する開発実装です。秘密鍵とauthor tokenはOS clientへ同梱しません。実際のpublisher審査、hardware secure clock、物理rollback耐性、本番Store運用は別ゲートです。

署名cacheのcommitとHub失効適用は同じadmission lockで直列化し、rename後のfsync失敗でもfinallyで実cacheを再確認する。workerのDB故障は上限付きbackoffで回復する。読み取り毎にbounded/O_NOFOLLOWで実ファイルを読み、完全一致のbytesと同じtrust policyのときだけ署名再検証を再利用する。mtime/pathだけを信頼せず、期限は毎回現在時刻で判定する。6件の専用境界と全体100件がPASS。

## 購入者Walletと正常なOS終了（09:25統合中）

UID1003のWallet daemonにDeviceWalletAdapterを組み込む。rootfsの公開handoff fixture参照を再利用し、追加の個人情報なしで登録する。登録と月額同意を分け、acceptedと表示済みterms_versionを明示受領する。月額はUSD8.88=888cents、UTC暦月、初月も定額で按分なしという開発規約。Device adapterは永続due→authorization→claim→既存WalletBridgeを使い、新しい残高台帳は作らない。

旧wallet.billの直接控除入口を廃止し、受付receiptとdueを同一transactionへ保存する。paidの判定はWallet billとbackend状態の照合後だけ。取消・失効で新規請求を止め、既存hold/settlementの照合は登録済み利用者に残す。全Wallet mutationとeligibility判定、残高＋membership＋billingのsnapshotは同じadapter lockで保護する。module56件とOS接続8件はhost PASS、現時点の新adapter guest検証は未実施。

root power daemonはUID1002/0だけをSO_PEERCREDで許可し、固定のpoweroff/rebootを通常init経由で呼ぶ。任意command/pathや強制-fは受け付けない。受付とdispatch claimを永続化し、同一keyやOS再起動後の古い要求を再実行しない。17件のLinux unit試験は実power callbackを置換してPASS。実guestの通常再起動→同data再起動→shutdownは次imageでQMP eventとclean filesystemを照合する。

## 明示的な遠隔実行許可（基盤実装中）

manifest schema2はdevice_localのみのまま。schema3は署名対象にremote契約、execution.remote権限、cloud/pc_usbという記号的送信先を追加し、package hash・入力hash・接続先・利用者の個別同意が一致した要求だけを遠隔runnerへ渡す方針。任意URL/pathの送信先指定や暗黙fallbackは禁止する。localを許可しない署名packageは既存local Hubでも実行しない。schema境界6件はPASS、遠隔実行と物理USBはまだPASSにしない。pc_usbのtransport fixtureと実USB機器を明確に区別する。

Buildrootの固定版とQEMU仮想ボードを使った選択は、型番未定の間もOSそのものをビルド・検証するためです。BlackBerryへの適合や最終製品のAndroid互換性を保証する選択ではありません。外付け容量と対応Linux環境を確保した上で、AOSPの製品ビルドと実機BSPを改めて比較します。[OS開発手順](../os/README.md)。

## 既存ホスト試作の境界（OS統合前の段階）

```text
Local browser (Japanese Hub)
  ├─ GET /api/catalog → local development registry (signed recipe envelopes)
  ├─ GET /registry/... → actual HTTP package download
  └─ same-origin session-protected /api/*
       ├─ Hub → hub.db (packages, installed version, jobs, audit, revocations)
       │    └─ bounded recipe worker process → text result + receipt
       └─ Wallet simulator → separate wallet-simulator.db (journal/postings/consent)
```

Hub APIはloopbackのみ、Host検査、HttpOnly/SameSite cookie、POST Origin照合、JSON/type/サイズ制限、CSPを実施します。cookieは同一PC開発sessionの保護であり、本人認証/端末資格/tenant境界ではありません。ローカルアカウントが侵害された場合の保護は提供しません。

Tool Packageはmanifest-v2、recipe、Ed25519署名のJSON。manifest-v1（既存receiver用）と混同しません。manifestとrecipeをcanonical JSONへ固定して署名し、recipeにもSHA-256を記録します。RFC公開テスト鍵だけを開発時に信頼します。本番用作者enrollment、署名鍵/失効の配送、registry index署名、timestamp/rollback attack対策は未実装。

Toolは有限の文章DSLだけを実行でき、ファイル、shell、network、Wallet DBへ到達するoperationはありません。Python workerは隔離modeで別process起動し、入力64KiB、出力128KiB、16step、3秒、active4件の上限を適用。一般nativeコードを隔離するOS sandbox、RAM/CPU quota、container/seccompは未実装。DSLの処理実装自体に脆弱性がない保証ではありません。

SQLiteのtransactionで署名検証済みpackageの新規保存とactive version変更を一括commit。更新/rollbackは無効状態へ戻り、exact package hashを再承認して有効化します。同一id/versionの別内容は拒否。失敗transactionは旧版を保持。停止/更新/削除/失効はactive workerをcancelし、late outputを採用しません。失効は実行前にも再確認。実行receiptはversion/hash/actual host/費用を記録し、入力原文は保存しません。処理結果には入力に由来する情報が残るため、履歴をprivacy-freeと扱いません。

起動時にrunning jobをinterruptedへ変更します。外部副作用のない純粋変換を新keyで明示再試行できます。永続distributed queue、遠隔worker再起動、実USB再接続を達成した機構ではありません。同一stateディレクトリを複数Hub processが同時に開く運用は未対応です。

Walletは独立SQLite DBに均衡journalを保存します。Hub recipeからWallet APIは呼べませんが、同じホストOS user/process権限内のシミュレーションであり、金融向け特権分離を達成したとは主張しません。AVAILABLEだけを月額/出金に使用。BEGIN IMMEDIATEで並行控除を直列化し、月単位unique請求、idempotency request照合を行います。部分排出/UNKNOWNは未確認分をholdし、確認された累計排出と照合して残額を返還。[Wallet詳細](wallet-simulator.md)。

## 実行先

`device_local`と`auto`は、このホストのrecipe runtimeへだけroutingします。UIは「このPC」と表示。cloud/pc_usb要求は利用不可を返し、データや費用の暗黙fallbackをしません。BlackBerry上の同等runtime移植、Cloud runner、相互認証USB companionは別段階です。

判断理由（元snapshot内の参照。履歴資料は今回のGit対象外）、[未完了ゲート](RELEASE-GATES.md)、[旧receiver protocol](protocol.md)。

### 2026-09-08 10:15 UTC: Wallet、電源、遠隔受付

Linux6.18.50 / 0952固定imageで購入者引渡しfixtureの引継ぎ・登録と同意の分離・月額888の一度だけの課金・取消を実guest55項目+独立Tools45項目で確認した。実native Wallet GUIでも7つの受付、別keyの請求2回に対して支払1回、20.00の試験売上確定後に11.12の残高、取消後の期間内利用まで実証した。本人確認・実資金providerは未接続。証拠 os/ui/evidence/target-wallet-0953。

同じ0952でUI identity→Platform→専用root Power daemon→正常initの再起動/停止を確認。QMPがguest自身のRESET/SHUTDOWN、異なる2 boot ID、永続2 dispatch、古いkey非再実行、停止後ext4 cleanを観測した。os/verify-system.pyの証拠は /var/tmp/rock-os-wallet-0952/system-20260908T095549Z-niac213x。Power native画面は次imageの実入力検証待ち。

新RunnerControlはHub/Walletと分離した専用private SQLiteを使う。remote.prepareは送信しないpreview、remote.submitは入力SHA/package/目的地/keyに対する明示同意のローカル受付。background workerが同keyのstatusを先に照合し、必要な送信・取消を行う。Hub/Registryの権限確認中にdurable sending claimを保存し、その後の通信ではHublockを保持しない。claim前の取消/更新/失効は送信を止め、claim後は取り消せない送信の可能性を残して照合する。terminalを保存後にエラーが返ってもterminalをunknownへ巻き戻さない。履歴は全体32KiB、個別outputは128KiB、準備/稼働/保存件数にも上限。標準sourceにcloud開発VM TLS endpointのみ組込み、実OSからの接続はまだ未検証。実Linux隔離workerを使う2経路の試験と、fake executorを含むhost32testsを区別する。物理USBはNOT_RUN。全体host153tests PASS。

Macから実OSを開くos/desktopは専用256MiB userdata、固定image hash、private UNIX VNCと所有SSH loopback転送を使う。既存不明dataや不整合dataをformat/repairしない。失われた起動記録があってもlive socketを削除せず拒否する。実接続・再開試験は未実施。

### 2026-09-08 10:54 UTC: 修正済みruntimeと実OS遠隔実行

1040固定imageはDash0.5.13.5を/bin/shにし、BusyBoxのash/awk/hush/sh appletを除外する。Hushのset -u非対応を実起動で検出したため、保護を弱めずPOSIX shellを切り替えた。stage0もtargetのDashとELF依存を集める。Python3.14.7には公式3.14 backport2件を原本hash固定で適用し、source/target/actualguestのhash一致と普通のZIP読取、shellの必要動作を確認した。Platform56＋Tools45 actual checks PASS。証拠 artifacts/os/platform-dash-pass-1040、依存候補分類 docs/SECURITY-INVENTORY.md。

同じ1040 imageのOSから、SDK署名Toolをowned TLS registry経由で取得し、明示同意した実入力を別の隔離workerへ送って処理する試験がPASSした（online34＋noNIC次boot12 checks）。remote acceptance応答544bytesのうち272bytesだけ送信して切断、同じkeyのstatus照合で実行重複を防ぎ、次jobは実NIC linkdownでunknownを保存→再接続後に同じreceipt/結果へ到達した。hostの独立RunnerDB・2回だけの実隔離process・入力と出力SHAをguest結果と照合した。Hub localjobとWallet残高は変化しない。証拠 artifacts/os/remote-pass-1046。公開cloud/物理USBではない。

Power nativeGUIの1040試験は取消と実再起動まで成功したが、終了時の保存commitが既定待ち時間を超え、rootのpendingだけが残りdispatchされなかった。原本 os/ui/evidence/target-power-dash1040-failure を保存。返信後にdispatchする境界は維持し、powerだけUI15秒/relay12秒/CLI12秒の総時間、構造化unavailableでも同一keyを維持、observerのBUSY/LOCKEDだけ期限内再試行へ修正した。これは次imageで再検証する。

Desktop offline backup sourceは停止済み専用dataのe2fsck -fnと全量SHA一致を要求し、復元先を新しい端末名に限定する。元dataの修復/上書きはしない。7 host境界tests PASS、実data backup→restore→bootは未実行。暗号化はこのbackup機能に未実装。全体host168 tests PASS（artifacts/os/host-tests-power-relay-backup.log）。

## 2026-09-08 12:54 UTC: ATM ownership and real desktop viewer

WalletService owns CardlessATMSimulator in its private Wallet database. DeviceWalletAdapter binds owner/device from protected handover/membership and holds the admission lock through owner operations; JSON-provided identities are rejected. Platform exposes issue/status/history/cancel/expire/timeout only. Actual ATM actor verbs require UID 0 directly at the private Wallet socket and bind the development ATM identity in OS code. This is an isolated cash-out simulator, without passkey authentication, real settlement provider or real ATM. The same-data two-kernel-boot test passed 32 checks, preserving UNKNOWN holds until cumulative dispense reconciliation.

Desktop schema3 exposes only private UNIX QEMU VNC/WebSocket endpoints inside the Linux VM. The existing authenticated local SSH tunnel forwards WebSocket to 127.0.0.1:5909. A loopback-only static noVNC viewer authenticates using a per-session eight-ASCII password and displays the actual 720x960 Linux framebuffer; password is passed in a URL fragment and removed immediately. No browser app recreates the OS UI. Actual authenticated framebuffer connection and pointer navigation passed on the Mac at12:51–12:53. Native Screen Sharing remained unverified due its password dialog; the browser transport supersedes that entry path. Backup/restore remains independently tracked.


## 2026-09-08 15:12 UTC — off-device Wallet authority continuation

The eight-hour delivery is immutable. The worktree now adds an optional new-device
remote Wallet profile. `os/wallet_backend/server.py` owns the existing WalletService,
entitlement scheduler and ATM simulator together in one fresh protected backend
state directory. All monetary mutations share the existing Wallet/adapter locks;
the OS proxy never opens a local financial ledger. Existing local device Wallet
state cannot be silently imported, cloned or switched by a configuration change.

The development TLS owner route is loopback-only and accepts registration, explicit
monthly consent, current-period billing acceptance and scoped owner ATM operations.
Fixture credit/settlement and ATM assertions are not exposed to an HTTP owner.
The provisioned owner token and an explicitly pinned persistent authority UUID are
required before dispatch. Every response repeats that identity. These are public
fixture authentication tests, not production identity or provider trust.

`/etc/rock-wallet/backend.json` explicitly selects remote mode. The dedicated Wallet
UID proxy persists immutable request receipts and a read-only snapshot cache in
`/data/wallet/backend-cache`. Provably unsent fresh requests are not queued. An
unknown operation retains its exact key/body across restart and is reconciled
before later mutations. Definite policy rejections close that request. The screen
shows last synchronization time and stale status, and disables new financial
controls for stale/pending state. An unavailable Wallet does not hide offline
Hub tools; unavailable balances remain absent, not fabricated as zero.

The separate-process TLS proof `os/wallet_backend/evidence/off-device-process-1510`
passed: September and October each debit888, with the proxy process fully terminated
before October, stable authority identity and balances after backend restart, and
no November debit after explicit cancellation. This is not yet an actual OS guest
poweroff test. Linux271 unit/integration cases passed at this stage. OS rebuild and
new-profile guest validation are the next evidence level; no E2E-F full gate claim.


### Remote profile loss guard

The OS startup factory refuses a local Wallet whenever any `backend-cache` entry
remains but `/etc/rock-wallet/backend.json` is absent. A file or dangling symlink
also counts; it does not repair, delete or migrate this state. Invalid configured
profiles propagate failure. A new local profile remains available for a new private
state directory. This covers lost configuration while durable remote state remains;
loss of both is not proof of prior authority identity. The native Wallet/ATM header
reports synchronization, including stale/pending state even when the page scrolls.


## 2026-09-08 15:39 UTC — Wallet continuation final evidence

The saved eight-hour delivery remains fixed. New image rootfs SHA
`20b6dbfbf12cb98f07887a62caec49a1cf191b451d8cad5a9855c22a65a800e9`
passes the default Platform56+Tool45 boot and the optional remote Wallet three-boot
proof `os/wallet_backend/evidence/os-threeboot-final-1532`. The OS terminates before
the October backend debit; NIC-less restart retains stale4112 with no queued
cancellation; reconnect sees3224 and explicit cancellation prevents a November bill.
All three shutdowns are normal, filesystem checks are clean, and device receipts
match the stopped single authority ledger. Linux279 tests pass; native stale-state
renderer/action tests pass separately. This is actual OS IPC and a public-fixture
backend, not BlackBerry, real provider or a native GUI operation proof. Full Must
and E2E-F conditions remain incomplete. Goal active.

## 2026-09-08 16:02 UTC — Tool の互換性・失効・停止再試行

継続開発の現在 profile は Rock star os **0.3.0**、`rock-recipe/1` の runtime version **1.0.0**。署名対象の manifest schema 4 は `compatibility` に `os: rock-star-os`、`min_os_version`、`min_runtime_version` を必須とする。最小版は数値の major/minor/patch として比較し、Tool 自身の `version` と分ける。入場判定と画面は同じ `CURRENT_PROFILE` を使用し、任意の caller 値で現在版を置換しない。[SDK の契約](TOOL-SDK.md#minimum-os-and-runtime-versions)を正本とする。

構造・署名の検証と、この端末での導入・実行許可を分ける。正しく署名された将来版向け Tool は registry の署名一覧に保持でき、他の項目の検証を壊さない。Platform は現在版と必要版から compatibility を付け、native UI は項目を残して導入・更新の入口を無効にする。実際の download、Hub の導入・承認・rollback・local 実行、遠隔受付と runner の入場時にも互換性を確認する。UI の無効表示だけを保護にしない。未知の runtime や recipe operation を許可する拡張ではない。

既存 schema 2/3 の署名 bytes は変更せず受け入れる。これらは OS 最小版未宣言、legacy runtime baseline 1.0.0 として扱い、local/remote の既存許可を維持する。これは新 OS が旧 package を扱えるという範囲であり、旧 0.2 OS が schema 4 を解釈できる保証ではない。旧 client に対応した署名 catalog の版交渉・分離配信は未実装。

更新・rollback・無効化・削除・失効の DB 変更と再試行 receipt を同じ transaction に保存し、子プロセスの停止は commit 成功後に行う。commit に失敗すれば旧版・承認・実行中の子を保持する。commit 後の signal が失敗した場合は、Hub lock 配下の pending stop に所有する子の参照を残して OSError を返す。同じ key/body の receipt 再送も停止を再試行してから成功を返し、新規 request は未完了停止を飛び越えない。通常の読み取りでは停止を再試行しないため、停止時の読み取り observer が再入しても再帰しない。終了済みの子は pending から除く。late output は cancelled job に採用しない。

registry は同じ mutex 内で固定 hash の package identity と `id@version`/publisher の失効を照合する。失効 commit 後に受付する raw GET は **404** と `{"error":"not found"}` を返し、immutable metadata・保存 bytes・過去 receipt は保持する。取得済みコピーや失効前に受付済みの通信を取り消す機構ではないため、client と Hub の検証済み revocations による導入・実行の拒否も継続する。失効解除による公開再開は実装していない。

ここで確認済みなのは当該変更の host 焦点試験で、registry TLS 33 件、Hub の実子プロセスを使う commit/停止境界 4 件と既存 request 6 件。今回の全変更をまとめた Linux 全体試験と新 OS の否定試験は**結果待ち**であり、以前の image や保存済み 8 時間成果物の PASS を流用しない。外部の人間作者による受入試験、可逆な公開一時停止・再開、旧 0.2 catalog 交渉は追加の改善・受入作業として未実施であり、新しい必須要件にはしない。既存の時刻付き証拠は各時点の記録として保持する。


### 16:20 UTC verification update

上記の結果待ちを更新: 最終Linux310件と新OSの基本起動Platform56＋Tool45がPASS。`os/registry/evidence/negative-final-1615/` は互換性の事前拒否（future GET=0）、10拒否・4実処理・10受付、容量不足/通信切断からの回復、失効、正常終了・clean ext4を実ARM64で照合した。native launcherの別起動も3画面・1電源受付・正常終了を確認した。原本や各時点の旧記録を保持する。旧client用catalogの版分離、可逆な公開一時停止、外部の人間作者の受入は任意の改善・追加試験として、元のhardware/provider要件と分けて追跡する。これらを未実施という理由だけで新しいMustを作らず、元のE2E条件の採否は正本の要件と証拠で判断する。

## 2026-09-08 16:56 UTC — 同一購入者の複数端末と単一Wallet契約

同じauthority内では `accounts.owner_ref` を一意にし、追加端末を不変の `account_devices` で既存契約へ結び付ける。追加の端末登録は別契約・別月額を作らない。旧 `account_id`、historical primary device、同意・authorization・receiptを残し、DDLと旧primaryのlink追加を1回のSQLite transactionで行う。同一ownerに複数の旧accountが既にある場合は自動合併せず、変更前に拒否して明示的な回復判断を要求する。別authorityの台帳を複製して同期する仕組みではない。

backendの任意の保護済みdevice credential設定は、端末別tokenと `POST /v2/wallet` を有効にする。authority UUIDと `X-Rock-Wallet-Device`、その端末のtokenを確認し、各読み取り・変更・receipt再送の前に現在の署名済みhandoffのowner・状態・期限を検査する。mappingは再起動時に追記できるが既存のref/owner/tokenは差し替え・削除できず、mappingへの追加だけでは購入資格を得ない。`DEVICE-CREDENTIALS.json` はtoken hashを保持し、`AUTHORITY.json` の `device_bound: true` はUUIDを保ったまま旧モードへの復帰を拒否する。設定消失・不整合でlocal/旧v1 writerへ戻らない。詳細と中断回復範囲は [backend契約](../os/wallet_backend/README.md#複数端末のbound-v2構成)を参照。

`DeviceWalletAdapter.device_scope` はその端末だけを認証し、adapter lockと同じEntitlementStore instanceのlockを処理終了まで保持する。署名済みhandoff/suspendの入口も同じStoreを通す。これは私有DB・単一authority processを前提とし、外部の直接SQL writerとの排他やhost侵害への保護ではない。月額の資格判定には現在有効なlinked deviceのいずれかを使うが、停止・期限切れの端末が別端末の資格でAPIへ入ることはできない。

継続同意と取消は契約共通。UTC月ごとのauthorizationと実Wallet billは一度だけで、利用可能残高とATM保留は一つの台帳で直列化する。bound modeのATM callbackにより有効な登録端末Bから同一ownerのA起源の保留を照合できる。消費済み・不明な出金を取消してもUNKNOWNのholdを勝手にAVAILABLEへ戻さない。要求keyは共有authority内で衝突を検出する。端末Aの登録keyや端末情報を含むATM keyをBで流用すると拒否し、別の控除を発生させない。

bound clientは確定済み要求もHTTPで再認証する。検証済み `unauthorized` を受けると拒否状態を永続化してWallet cacheを表示せず、以前のpendingとreceiptは金融結果の照合用に保持する。拒否を解くのはauthority/deviceに結び付く完全な返答を検証した後だけ。不明な応答で成功・拒否を推測しない。通信前からofflineの端末に停止を即時通知したり、既に取得したbytesを遠隔消去したりする機構はない。公開fixture認証はpasskey・hardware identity・本番本人確認ではない。

この時点の検証はMacの新規実TLS14件＋既存server21件がPASS、Linux全体324件は新規14件を含む前の結果、Store/adapter/bridge関連71件がPASS。新image rootfs SHA `8bbcc317f875a5fb99ee586f16f73f267f72c1a0c97fd51701721f03a66dc2e8` の既定profileは実Platform56＋Tool45 checks PASS。**端末A→端末B→停止済みAの3boot実証は結果待ち**であり、host成功を代用しない。元のMust全体は継続中。BlackBerry実機・金融provider・passkey・有料サービスのentitlement連携は未達。


### 2026-09-08 17:09 UTC 検証結果の確定

上記の3boot結果待ちを更新: `os/wallet_backend/evidence/multi-device-os-20260908T1704Z` は17:04:42–17:06:55 UTCの実OS A/B/失効AでPASS。正常終了3回、clean ext4、同一契約と888一度・B取消、Aのcache非表示/再送拒否、別bill keyのHTTP送信0、停止済み正本とのreceipt一致を確認した。GUI/実認証/実機の証拠とは分ける。最終Linux全体338＋契約関連71＋ATM40がPASS、計449実行、最終ログにskip/例外/警告なし。詳細はCHECKPOINTおよびE2E結果を参照。全Mustは未達でGoal active。


## 2026-09-08 Wallet認証の継続開発（検証中）

WalletService と HTTPS authority の既定設定を認証必須に変更した。購入記録に基づく account/device の準備登録、WebAuthn形式の公開鍵登録、Wallet利用規約への同意、月額USD8.88への同意を別々の操作として扱う。既存登録だけでは出金できない。追加した認証mode/credential/state/challenge/terms/quote/approvalの7tableは同じWalletDBに置き、既定を導入済みの台帳から古い認証なしfixtureへ戻ることを拒否する。旧機能の回帰試験は明示的なlegacy fixtureとして残す。

出金見積りはauthority/account/device/credential、要求key、USD金額、ATM、手数料、受取現金額、期限とpolicyを固定する。公開ATM simulatorの手数料は0のみで、有料ATM手数料の会計は未実装。署名検証はclientDataJSONとauthenticatorDataを使う限定WebAuthn実装で、packed self-attestation + Ed25519、RP/origin/challenge、UP/UV、credential ID、counterを照合する。根拠は[W3C WebAuthn Level3、2026-08-25 Recommendation](https://www.w3.org/TR/2026/REC-webauthn-3-20260825/)の登録・assertion検証手順。対応形式を限定しており、一般の全認証器への対応を宣言しない。

承認の消費、署名counter、出金予約、ATM credential、immutable receiptを同じWallet transactionで確定する。時計の最大値は別の耐久記録に保存して期限切れの巻戻り復活を拒否する。応答が失われた場合は同じ要求を再送して照合する。新規redeemではorigin deviceと承認credentialの現在資格を確認し、消費済みUNKNOWNの事後精算は失効で閉じない。旧wallet.reserve/金額だけのwallet.atm.issueは認証必須モードで拒否する。

端末側の認証器は専用UID1004の公開software test fixtureで、既知の公開RFC8032鍵を輸入し、新しい署名鍵を生成しない。試験PINの入力は実機本人確認・生体認証・hardware-backed passkeyを意味しない。実機への信頼、秘密鍵による端末間の分離、実金融provider、実ATM接続は未達。暗号署名の実行と検証、ソフトウェア境界、残高の整合性を今回の検証対象とする。元のMust全体のGoalはactive。


## 2026-09-08 18:38 UTC — Wallet署名認証の統合

認証モード・credential・counter・challenge・terms・quote・approvalの7表をWalletと同じDBへ置く。新規予約はDB triggerでも対応approval/消費済みquote/額/有効credentialを要求し、旧APIへの迂回を拒否する。新規billはWallet writer内のtrusted資格callbackとDB guardで有効な契約・認証を再確認する。CLAIMEDだけが残る未控除の要求と、既に保存されたbillの再送を区別し、前者は失効後に新規控除できず後者は回復できる。root侵害や旧OS全体への安全なdowngradeまで保証する仕組みではない。

今回の実装・検証・残る条件（元snapshot内の参照。履歴資料は今回のGit対象外）。最終結果と停止状態は同記録の追記を優先する。


### 18:54 UTC — 最終認証OSの結果確定

1830 imageのnative実画面12段階・19枚とstage0更新3bootがPASS。GUIは正常電源off・停止済み台帳一致、stage0はcommit保存直後の意図的中断と復旧を確認し、終了条件を混同しない。今回の最終Linux536試験と全7起動の範囲・hash・失敗履歴は確定記録（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。前の「検証中」を更新する。全Mustは未達でGoal active、既存4配布物は固定保持。

## 2026-09-08 19:25 UTC — 購入端末資格と有料サービスの分離

ServiceAccessControllerはWallet authorityと同じEntitlementStoreインスタンスを共有し、現在の署名済みowner/deviceとpolicyを確認したままRegistry/Runnerの永続受付を直列化する。所有者単位のtenantは端末交換で保持する一方、queued jobの実行開始は受付元の端末資格で再確認する。新しいmode/policy/consumer bindingは既存Entitlement DBの2表へ追加し、raw tokenや本人確認参照をadmission結果へ出さない。純粋なsnapshotと、時計highwaterを永続化するguardを分ける。

Storeのindex/packageと既定のPC-linkは購入資格のみを要求する。既定の有料cloudは確認済みPAIDまたは明示policyのGRACEを新規受付・開始条件にするが、結果・receipt・取消の回復は未払いで閉じない。基本OS、端末内Tool、自分のデータ、Walletの資金・既存保留の必要な回復はこの月額gateの対象外。猶予0秒・自動失敗3回は明示したsandbox設定で、本番の料金条件や新しいMustではない。取消後も支払い済み期間を保持し、追加猶予や再控除は発生させない。

閉鎖profile欠落時は無認証開発用設定へ戻さず、遠隔workerを停止した読み取り可能なControllerを起動する。prepared/queued入力と送信済み照合情報は保持する。ホストcontroller25、請求policy38、OS構成11件がPASS。両方向authority pin・cache binding・複合終了の故障回復を含むtransport統合、新Linux全体、新image実OS検証はまだ確定していない。増分の実装と検証範囲（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。18:56固定のWallet-authを含む5納品物は変更しない。

19:30 UTC更新: 両方向authority pinとconsumer cache bindingの実TLS等ホスト94件（購入者29＋既存Registry33＋Runner32）がPASSし、source/log hashの独立照合も完了した。複合終了は終了済みresourceを再closeしない状態管理を追加した。新しい統合OS・端末off請求・supervisorの採用証拠はまだ結果待ち。host構成のcanonical hashと配布ファイル原本SHAは別の照合値として扱う。詳細と現時点の限界は上記増分記録の19:30追記を参照。


### 2026-09-08 19:54 UTC — Service access の統合検証

購入者資格・有料サービス・回復の分離と、同じStoreによるWallet/Registry/Runnerの受付直列化は、Linux646件の採用まで進んだ。root433には実Linux隔離executorと独立backend lifecycleが含まれ、残る認証63・契約85・ATM40・controller25と入力一致で結合した。閉鎖profile障害でもlocal Tool/履歴と未送信・送信済み要求を保持する境界は変えない。

1938と1949のkernel/rootfsは同一で、前者の既定OS61＋Tool45がPASS。1949はfactory envelopeのmode修正に伴うstage0再作成であり、初回既定OS再確認はowner IPC unavailableのFAILを保存した。新購入者profileの実OS/nativeとstage0の実bootをこの段階で成功に含めない。現証拠と限界（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。5つの既配布物は固定、Goal全体はactive。


20:00 UTC更新: 購入者profileの実ARM64起動とUID1000 Platform IPCがPASS。正本の購入資格・支払い状態に基づくStore/Runner拒否、支払後の実隔離cloud1件、未払い/期限切れ/失効後のlocal3件、888一度と停止済み正本の一致を確認した。unknownと同keyの「jobなし」照合を区別する状態も維持した。41公開証拠・31 source・1949基底を独立hash照合済み。確定範囲（元snapshot内の参照。履歴資料は今回のGit対象外）。nativeや新stage0 boot、今回複合authorityのOS停止中翌月請求には換算しない。


20:08 UTC 終了方法の訂正: 既定Platform検証（193943/195600）のS99 hookは `sync; poweroff -f` を使用する。kernel電源断とclean ext4の確認を、通常initによるサービス停止と呼ばない。raw invocationのlegacy `normal_shutdown:true` は保持し、独立reviewの訂正（元snapshot内の参照。履歴資料は今回のGit対象外）に初回記録を結合した。購入者OS195205は通常 `/sbin/poweroff`・unmount・guest QMP SHUTDOWNを別途確認済み。native電源操作の採用はまだ待ち。


### 2026-09-08 20:24 UTC — 購入者profileの配布経路を実測

配布用の閉鎖profileを追加hookなしの実ARM64で起動し、native Store閲覧・検索・詳細表示と未登録Wallet同期状態を確認した。専用authority/consumer/deviceと署名catalogの結合、86現sourceと前後hash、3 image mapsが一致した。独立review（元snapshot内の参照。履歴資料は今回のGit対象外）は8原本の目視と通常initのdaemon停止→data unmount→powerdownを確認している。Tool取得/実行やWallet取引は別の195205実IPC試験で、今回nativeは読み取りと電源操作だけである。

端末外backendはQEMU内OS終了後も稼働し、その後明示的に通常停止した。開発VMも20:22:13 UTCに通常停止済み。この配置・lifecycleの実測は、開発VM/Macの停止後の継続実行や複合構成での翌月請求の一体試験を保証しない。直接kernel起動のため新stage0 bootも未実行。確定証拠・失敗履歴・未達（元snapshot内の参照。履歴資料は今回のGit対象外）を維持する。


### 2026-09-08 20:37 UTC — 購入者profileの更新・料金・月次復旧

元Mustと新しい受入境界（元snapshot内の参照。履歴資料は今回のGit対象外）を再監査した。persistent closed markerがopen降格を防ぐことと、candidateのサービス設定が保持されることは別条件である。更新healthはlocal protected bindingを確認し、ネット接続やPAIDをOS起動条件にしない方針を主担当へ共有した。UIはTool価格/追加実行料金/月額888を分け、構成済みと現在の購入/PAID許可を同一視しない。複合authorityでのOS停止中翌月請求・再接続と新stage0復旧は準備中で、実行済みとはしない。内部担当分離SDKとtest authenticatorを許容する原文の範囲を守り、実機/実USBの元Mustは未完了として保持する。6旧納品物は固定、Goal active。


### 2026-09-08 — 運営plan、端末利用開始、表示待ちの分離

[運営管理と端末導入](OPERATIONS-AND-ONBOARDING.md)にローカルの承認/CAS/canary/hold/UNKNOWN回復と永続activationを実装した。運営endpoint、配信executor、実機flashは未接続。検証済みpreinstall profileはroot-ownedの現在stage0 boot factsと保護binding、同じauthorityの購入資格を照合し、UID1000のkeyだけで利用開始を保存する。本人確認scopeのopaque referenceを維持し、Wallet登録・規約・月額同意を自動実行しない。direct-kernelや不明/locked実機を開始可能と表示しない。

購入者PlatformのWallet表示は単一background readerと5秒TTLを使い、端末snapshotを外部応答待ちから分離した。初回不明はNone、失敗/期限切れは元の金額をstale表示し、tapを拒否する。mutation後の古いin-flight応答はfreshへ戻さず、通常readonly pollは無効化しない。実admission/支払いは既存authorityが再判定する。新51件と既存18件の焦点テストがPASS。新activationのactual stage0/native実測は次のbuildで別途確認する段階であり、現在のunit成功を実機導入や全Must達成の証拠にはしない。

### 22:51 UTC — AI予算とtarget buildの分離

[AI経路/内部計算予算](CLOUD-AI-STRATEGY.md)は明示plan・共有owner予約・send-once claim・UNKNOWN/超過保留を独立moduleとして実装、Mac23試験と独立reviewがPASS。実LLM/Runner/有料ServiceAccess gateとの接続は未実施で、月額USD8.88を変更しない。

利用開始版の新image（元snapshot内の参照。履歴資料は今回のGit対象外）ではhost ELF混入による黒画面を実画像から特定し、UI/coreのpackage buildをclean→target再compileへ修正した。実Makeの回帰2試験はPASS、新target ELF検査と再起動実証は進行中。現在の実OS成功や全体Linux合格へhost試験を流用しない。

## 2026-09-09 01:30 UTC — 署名付き利用開始とdesktop v5

利用開始の確定記録（元snapshot内の参照。履歴資料は今回のGit対象外）で、実stage0二回起動・一回tap・状態保持・通常終了・金融変更0を確認した。現行Linux876実行はPASS。desktop v5は明示的な署名付きbootを選び、immutable profile/factory/3image hashを照合する。A/B/dataは独立private file、保存markerと過去の記録が欠ける端末を新規初期化しない。backup/2は停止後の三領域と署名済み更新状態を照合し、新しい端末名へoffline復元する。実ランチャーと復元の証拠は同記録へ追加する。旧schema1–4と六つの固定配布物を保持する。一般のnative描画障害をS97が検知する仕組み、実BlackBerry、物理USB、本番金融provider・MCP/AI/運営配信との統合は残る。

01:56 UTC更新: desktop v5の実起動、起動再実行の同session再利用、native tap、OS内reboot/poweroff、三領域backup/新端末offline実boot/正常終了後のactivation・Wallet保持を確定した。元端末とbackupは不変。詳細は確定記録（元snapshot内の参照。履歴資料は今回のGit対象外）。通信なしの購入資格再確認待ち表示は残り、保存済みTool入口の閲覧とTool実行の証拠を区別する。

## 2026-09-09 — MCP管理サービスの永続化

購入者backendへ任意のPersistentMCPRuntimeを統合した。保存済みauthority・CA・固定gateway/provider port・consumer・aliasを結合し、再起動時は同じBrokerと所有試験サービスの受領記録を開く。欠落した履歴を空の新規データベースとして作り直さない。MCP単独の障害はUNAVAILABLEとして閉じ、Wallet・Registry・Runnerの既存サービスを継続する。全体終了はgatewayの新規受付停止→受付済み処理→Broker worker→provider→Wallet依存の順で、終了が確認できない依存のlockを早期解放しない。

現実装の境界は[継続記録](MCP-RUNTIME-CONTINUATION.md)を参照。Linux全1,003件はPASS、実OSの新しい再起動証拠は別工程である。JSONのみのMCP部分対応・所有試験サービス固有の結果照合契約であり、一般のMCP準拠や外部金融実行を保証しない。

04:22 UTC確定: 新イメージの実OSで一回tap・一件MCP処理・管理backend交換・通常OS再起動・同じ結果/解除/通常終了がPASS。全1,003件と実プロセス4世代の結果を[継続記録](MCP-RUNTIME-CONTINUATION.md)へ結合。模擬Walletは不変、確認待ち表示への更新一回は残る。保存runtimeの起動ファイルは確認中で、実機や外部provider完成とはしない。
