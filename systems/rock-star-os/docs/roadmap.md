> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# 開発段階と次の作業

2026-09-09 03:04 UTC: [MCPのHub統合](MCP-HUB-INTEGRATION.md)のnative画面・端末client・実authority接続を新OSへ反映。現行Linux950実行と実画面での接続・同意・一件実行・解除・結果参照・通常終了がPASS。第三者配布・有料精算・実OAuth・AI・運営配信との結合は残る。従来の876実行と固定7成果物は従来コードの証拠として保持する。

2026-09-09 01:56 UTC更新。最新増分（元snapshot内の参照。履歴資料は今回のGit対象外）は実stage0のtap・二回起動・金融変更0と現行Linux876実行を確定した。desktop v5の通常ランチャー・三領域復元も実確認した。MCP broker、ToB精算、AI計算予算は独立moduleで、外部サービスとOS Hubへの統合は残る。

製品名はRock star os。初期対応対象はBlackBerryです。旧計画のPixelをBlackBerryの達成条件に代用しません。

以下の段階表は初期の保存時点であり、最新の状態は本書冒頭と末尾の時刻付き追記を参照。

| 段階 | 状態 | 次の具体作業 |
|---|---|---|
| M0a OS本体のビルドと仮想起動 | 0.1仮想ARM64 PASS | 外付けSSD移行後も同じimageで2boot PASS、0.2統合buildも生成済み |
| M0b OS権限と永続化 | 仮想OS統合PASS、実GUI取得/操作PASS | 46platform＋45Tool checks、実GUIストア操作、直接取得後のoffline2boot 27＋6checks。正常終了/再起動を追加検証 |
| M0c OS更新と復旧 | 6.18.50/data ABIの実8boot PASS、fault10bootまでPASS | full-data fixtureの残余空き1.6MBという試験仮定を修正、真のroot空き0とcommitted fallbackを再検証 |
| 開発用Hub・有限recipe・SDK | ホスト実装/検証済み | trust分離、型仕様安定化、配布/更新中断と容量障害の拡張 |
| M1 BlackBerry OS/Hub/端末内 | 未完了 | 実機model/variant確定、正規boot・復旧・driver審査、Android移植、Linux/AOSP環境 |
| M2 開発者配布・3モード | 3追加Tool/実OS直接取得/実GUI PASS、TLS28tests PASS | schema3明示送信同意、Cloud/PC-link transport、独立作者鍵、物理USB、外部開発者試験 |
| M3 全機能移植・購入者Wallet/月額 | device adapter56件＋OS接続8件host PASS、guest統合中 | 最小登録・現在同意・永続月次schedulerの実OS/実GUI、実KYC/entitlement/passkey/provider |
| M4 cardless ATM | ledger/部分排出simulator部分のみ検証 | ATM認証credential、replay/盗難/照合/全故障case、ATM transport |
| M5 実資金pilot・本番 | 未実施 | 契約・法域・機器・認証・実地運用・別途本番承認 |

優先順は、OS本体の仮想起動→権限と永続化→OS更新と復旧→OS標準Hub/Wallet基盤→BlackBerry実機での統合→作者配布信頼・Cloud/USB・金融接続です。BlackBerry型番・導入と復旧・ドライバー調査は並行します。機種はユーザーが未選定なので、過去のKEY2仮説を確定条件にしません。Wallet文書やWeb画面を増やすことでOS基盤の代替としません。

CHECKPOINT（元snapshot内の参照。履歴資料は今回のGit対象外）を入口に同じ基準SHA/branchから再開します。各Must未完了は[RELEASE-GATES](RELEASE-GATES.md)で追跡します。実機なしのhost成功を実機PASSへ変更しません。

### 10:15 UTC 更新

- 完了（0952 actual guest）: Wallet登録/明示同意/888 exactly-once/取消、55+45 checks、実native Wallet11画面。正常Power再起動/停止2bootsとclean userdata。
- 完了（0952内の方式比較に限定）: 3 warmup+30 measured pairs、132 actual jobs、3Tools中央値998.351ms/1Workflow348.527ms。実機・他OS・人の所要時間へ外挿しない。
- 実装済・次image待ち: native Power確認画面、remote Controller＋OS標準fixture endpoint、hushへの切替えとawk不要のmount検証。公開脆弱性の候補はCNA版本情報を調査中であり、脆弱性不在とは判定していない。
- 残作業: actual remote OS→runner、native remote同意/result、live desktop起動、cardless credential adapter、device-side SDK改善、full-data fault fixture修正、物理USB/BlackBerry/金融provider外部gate。

### 10:54 UTC 更新

- 1040 actual: DashとPython公式修正を含む56+45 checks、remote34+12 checks、実2隔離workerと通信断/応答切断/noNIC再起動PASS。
- A/B: Dash版通常8boots PASS。13fault boots実行中。ext4 metadata reserved_clustersは0へ変更せず、rootfallocate/atomicstate_saveのENOSPCを実証するfixture。
- PowerGUI: 実再起動PASS、終了pendingの応答期限を修正して新build中。nativeRemote UIは次工程。
- Desktop: 起動/保護10＋backup7 host tests、liveVNC/実復元bootは未実行。
- ATM: 同じWallet transactionで出金holdと期限付きcredentialを作るsimulator開発中。実ATM/実資金ではない。
- 継続優先: PowerGUI再検証、nativeRemote/liveDesktop、実backup restore、ATM actual integration、配布成果物と全gate証拠整理。BlackBerry/物理USB/金融providerは未完了。

## 2026-09-08 12:54 UTC priorities

ATM kernel-boot simulator32checks and authenticated actual-framebuffer Mac viewer are verified subsets. Finish native Remote and ATM owner operations, then verify offline clean backup→restore→actual boot and export a current reproducible image/source/license bundle. Keep physical BlackBerry/USB, hardware passkey, off-device billing integration, provider sandbox and public service gates pending; do not treat elapsed eight hours as completion.


### 2026-09-08 15:12 UTC continuation beyond the saved eight-hour window

- Implemented optional remote single-authority Wallet service/proxy, persistent authority pin,
  current-state cache, exact unknown-request recovery, native stale-state controls.
- Verified Linux271 unit/integration cases and separate-process/TLS monthly continuation
  while the device proxy process is terminal; no real money or provider.
- Next: new OS image boot and actual guest off→backend monthly debit→guest on/sync,
  including stale mode and duplicate/lost acknowledgements. E2E-F remains incomplete.
- The 14:48 delivery stays fixed. Future changes and evidence are separate from that snapshot.


Additional boundary completed: loss of the remote config with a retained cache
refuses local ledger creation. Linux279 tests pass, including actual truncated TLS
ACK recovery across proxy restart and profile selection. Final-image three-boot
proof and source/image export are in progress. Physical and provider gates remain.


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

## 2026-09-08 16:02 UTC — Tool 安全性の継続工程

0.3.0 の schema 4 に署名済み OS/runtime 最小版を追加した。構造・署名が正しい将来版向け Tool は一覧へ残し、現在の profile での導入・承認・rollback・実行を別途拒否する。native UI は互換性のない導入・更新入口を無効にする。旧 schema 2/3 の署名は変更せず、新 OS での受け入れを維持する。[設計](architecture.md#2026-09-08-1602-utc--tool-の互換性失効停止再試行)と [SDK](TOOL-SDK.md#minimum-os-and-runtime-versions)を参照。

Hub は更新等の DB 変更と receipt を commit してから子を停止し、commit 失敗時は旧実行を保持する。停止 signal の失敗は pending に残し、同じ key の再送で実停止を再試行する。registry の失効は固定 hash の直接 GET にも 404 を適用し、履歴と append-only 失効は保持する。host の registry TLS 33 件、Hub 停止境界 4 件＋request 6 件は確認済みだが、今回の統合版を実 OS で検証した結果ではない。

次は Linux 全体試験と、新しい固定 image の否定試験を完了し、source/image/実 API 結果を結合する。対象は不適合 package の一覧保持と導入・実行拒否、失敗した更新での旧状態保持、失効後の承認・実行・raw GET 拒否。現時点は双方**結果待ち**とし、root の確報後に更新する。

外部の人間作者による作成・投稿・利用の受入試験、可逆な公開一時停止と再開、schema 4 を読めない旧 0.2 OS 向けの署名 catalog 版交渉・分離配信は追加の改善候補として残る。これらを新しいMustとして元の要件へ加えない。append-only失効を可逆な公開一時停止の達成とせず、新OSの旧package対応を旧OSの新schema対応へ換算しない。保存済み8時間成果物と以前のimage証拠は変更せず、この継続工程と分けて残す。


### 16:20 UTC verification update

上記の結果待ちを更新: 最終Linux310件と新OSの基本起動Platform56＋Tool45がPASS。`os/registry/evidence/negative-final-1615/` は互換性の事前拒否（future GET=0）、10拒否・4実処理・10受付、容量不足/通信切断からの回復、失効、正常終了・clean ext4を実ARM64で照合した。native launcherの別起動も3画面・1電源受付・正常終了を確認した。原本や各時点の旧記録は保持する。旧client用catalogの版分離・可逆な公開一時停止・外部の人間作者による受入は任意の追加作業として追跡し、元のMust採否とは分ける。hardware/provider等の未達要件は元の基準のまま残る。

## 2026-09-08 16:56 UTC — 複数端末の契約共有

- 実装済み: 一つのauthority内で同一ownerの購入端末を同じ契約・Walletへ追加する。旧primary/account/receiptを保持する加算的migration、曖昧な旧複数契約の変更前拒否、端末別v2資格・追記専用mapping・旧モードへの復帰拒否を追加した。
- 実装済み: 月額888と取消を契約で共有し、停止端末は各APIと再送で個別拒否する。有効な別端末でownerのATM保留を確認・解決でき、UNKNOWNの未確認額は保留のまま。拒否済みcacheは隠し、未解決receiptは捨てない。[設計](architecture.md#2026-09-08-1656-utc--同一購入者の複数端末と単一wallet契約)と[設定契約](../os/wallet_backend/README.md#複数端末のbound-v2構成)。
- 確認済み: Mac新規実TLS14件＋既存server21件、Linux Store関連71件。Linux全体324件PASSは新規14件の追加前。新しい1654固定image（rootfs SHA `8bbcc317f875a5fb99ee586f16f73f267f72c1a0c97fd51701721f03a66dc2e8`）の既定OSはPlatform56＋Tool45 PASS。
- 次の判定: 同じbackendにAとBの別userdata/cacheを接続する実OS3boot。Aで登録・同意・888一度→A停止の署名反映→Bで同じ契約/4112残高/取消→古いcacheを持つAが拒否されることを、実IPC・停止済み台帳・正常終了で結合する。現時点は**結果待ち**。

この開発は公開fixtureによる単一台帳の検証であり、passkey/BlackBerry実機/実金融provider/有料サービスのentitlement連携の完成ではない。offlineの取得済みbytesを遠隔消去する保証もない。元のMust全体はactiveのまま、既存の固定deliveriesは変更しない。


### 2026-09-08 17:09 UTC 検証結果の確定

上記の3boot結果待ちを更新: `os/wallet_backend/evidence/multi-device-os-20260908T1704Z` は17:04:42–17:06:55 UTCの実OS A/B/失効AでPASS。正常終了3回、clean ext4、同一契約と888一度・B取消、Aのcache非表示/再送拒否、別bill keyのHTTP送信0、停止済み正本とのreceipt一致を確認した。GUI/実認証/実機の証拠とは分ける。最終Linux全体338＋契約関連71＋ATM40がPASS、計449実行、最終ログにskip/例外/警告なし。詳細はCHECKPOINTおよびE2E結果を参照。全Mustは未達でGoal active。


## 2026-09-08 Wallet認証の継続開発（検証中）

- 実装: 既定Wallet認証必須、購入端末ごとのWebAuthn形式の登録、Wallet規約と月額同意の分離、署名付き出金見積り、承認/予約/receiptの同時保存。暗号署名には公開software test authenticatorを使用する。
- 確認済み: 実WalletService統合7件、実loopback TLSとOS proxy統合4件、認証器の3tableを含むバックアップ44table検査14件。新規OS imageの起動とnative PIN操作はまだ未検証。初回Linux全体345件は新しい試験の私有ディレクトリ作成不足7件で失敗し、fixtureの作成modeを修正後に該当7件PASS。全体の最終再検証はこれから。
- 次: 専用UIDのnative認証器と画面を含むOSを再構築し、実IPC・正常起動/終了・再送を検証する。既存4成果物を変更せず、新imageとsource/evidenceをまとめる。
- 残るMust: BlackBerry機種確定と実機、physical USB、provider/本人確認連携、実ATMと手数料、Store/Runnerの購入者・有料契約制御など、元の要件を引き続き扱う。この認証増分だけで完成としない。


## 2026-09-08 18:38 UTC — Wallet署名認証の統合

認証の最終Linux536試験と実OS基本・ATM2bootがPASS。続いてnativeの誤PIN→登録→規約→quote取消→承認→保留取消、stage0の認証器health必須と更新commit中断からの再起動を確認する。次の元Mustとして購入者Store/Runnerの利用境界を進める。BlackBerry実機・physical USB・本番provider等は元の条件のまま追跡する。

今回の実装・検証・残る条件（元snapshot内の参照。履歴資料は今回のGit対象外）。最終結果と停止状態は同記録の追記を優先する。


### 18:54 UTC — 最終認証OSの結果確定

1830 imageのnative実画面12段階・19枚とstage0更新3bootがPASS。GUIは正常電源off・停止済み台帳一致、stage0はcommit保存直後の意図的中断と復旧を確認し、終了条件を混同しない。今回の最終Linux536試験と全7起動の範囲・hash・失敗履歴は確定記録（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。前の「検証中」を更新する。全Mustは未達でGoal active、既存4配布物は固定保持。

## 2026-09-08 19:25 UTC — 購入者Store/Runnerと支払い状態

- 実装済み・ホスト焦点確認: 同じWallet正本を使う購入端末guard、所有者単位の回復tenant、PAID/GRACE/PAUSEDの分離、時計巻き戻り拒否、取消後の支払い済み期間保持、当月の有限自動請求と同一claim回復。controller25、請求policy38（新規14）、OS構成11件PASS。無料Storeに月額同意や残高を要求しない。
- 修正・統合中: Registry/Runnerの両方向authority pinとcacheのconsumer結合、複合authorityの終了故障後の再試行、実TLSの失効・別owner/authority・支払い停止と回復。端末の閉鎖構成が欠落した場合は、入力・同意・receiptを保ったまま遠隔workerを停止し、ローカルToolと履歴は使える。
- 次の採用条件: 最終Linux全体→新しい固定image→購入者Store取得/明示cloud実行・非購入者/未払いの拒否→端末off時の既存888月次請求と再接続・取消/回復を、実IPCと正本へ結合する。現在は未実行・結果待ちで、以前のWallet単体や認証OSの証拠を代用しない。

猶予0秒、有料対象の既定cloud、自動失敗3回は検証用policyであり、元の要件に新しい必須料金や無制限の無料期間を加えない。基本OS、自分のデータ、資金と必要なWallet回復を未払いの停止対象にしない。今回の詳細（元snapshot内の参照。履歴資料は今回のGit対象外）。既存5納品物は固定し、BlackBerry実機・物理USB・本番provider等の元の未完条件とGoal activeを維持する。

19:30 UTC更新: authorityの両方向wire結合・別consumer cache拒否を含むホストtransport94件PASS、実log/source SHAも独立照合した。複合authorityの終了済みresource追跡を追加済み。次は最終Linux全体、独立backend supervisor、新OSでの購入資格・有料サービス・正常終了と端末off請求の実証を結合する。現在はその結果待ちで、94件をguestや実隔離workerの成功へ換算しない。


### 2026-09-08 19:54 UTC — 購入者サービスの次の判定

Linux646件がPASSし、基底kernel/rootfsは既定OS61＋Tool45まで実証した。最終1949はstage0 factory権限だけを直した同一kernel/rootfsで、再確認の初回FAILを保持している。次は新購入者profileの実OSで、購入前/未払い/支払後/期限後/端末失効と、Store取得・remote実行・local継続・正本888一度を結合する。native操作と正常停止も別に採用し、終わるまで結果待ちとする。最新記録（元snapshot内の参照。履歴資料は今回のGit対象外）。

元のBlackBerry型番・実機BSP/起動/driver/通信/電池、物理USB、実本人確認・金融provider・実ATM/資金の要件は残る。開発fixtureの成功をこれらの代替やGoal完了にしない。既存5配布物は保持し、新しい配布物は証拠確定後に固定する。


20:00 UTC更新: 購入者profileの実OS通信・1cloud/3local・888一度・正常停止と正本の結合はPASS。1949既定61＋45も再確認済み。次は新しいnative操作の原本と配布物の照合。新stage0実bootや複合authorityのOS停止中翌月請求の一体試験は今回未実行のまま、旧証拠との範囲を分ける。型番未定のBlackBerry・物理USB・実provider等の元Mustは継続する。


20:08 UTC 終了方法の訂正: 既定Platform検証（193943/195600）のS99 hookは `sync; poweroff -f` を使用する。kernel電源断とclean ext4の確認を、通常initによるサービス停止と呼ばない。raw invocationのlegacy `normal_shutdown:true` は保持し、独立reviewの訂正（元snapshot内の参照。履歴資料は今回のGit対象外）に初回記録を結合した。購入者OS195205は通常 `/sbin/poweroff`・unmount・guest QMP SHUTDOWNを別途確認済み。native電源操作の採用はまだ待ち。


### 2026-09-08 20:24 UTC — 本増分の実測を確定、元Mustへ継続

購入者OS通信と配布用native閲覧/検索・Wallet同期表示・通常電源終了まで採用した。Linux646、既定61＋45、1実隔離cloud/3local/888一度は、それぞれの原本とsourceに結合した。最終記録（元snapshot内の参照。履歴資料は今回のGit対象外）。所有backendと開発VMの通常停止も完了し、5旧納品物を保持した新bundleの固定へ進む。

次の検証課題は、今回の新stage0実boot、複合authorityでの端末停止中翌月請求と再接続、残るサービス状態表示と未解明の取消応答FAILである。元のBlackBerry実機、物理USB、本番本人確認・金融provider・実ATM/資金等を任意改善へ変更しない。nativeでのTool導入/実行・支払いを今回の閲覧画面から推定せず、全Must/E2EとGoalは未完了を維持する。


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

任意MCPの固定設定、履歴保持、部分障害時のWallet継続、起動profile照合、通信全体の期限を実装。全Linux1,003件（入力前後一致）はPASS。次の採用条件は新OSの署名付き起動、native接続・送信、管理backendのプロセス交換、OS自身のreboot後の同一結果参照・解除・通常終了。[今回の記録](MCP-RUNTIME-CONTINUATION.md)で実測と未実施を分ける。

BlackBerry機種選定と正規導入・復旧、物理USB、外部MCP/OAuth、AI実行先・費用管理、ToB精算、運営配信executor、本番本人確認・金融provider・ATMという元のMustは残る。固定配布物8点を変更せず、Goalはactiveを維持する。

04:22 UTC確定: 新イメージの実OSで一回tap・一件MCP処理・管理backend交換・通常OS再起動・同じ結果/解除/通常終了がPASS。全1,003件と実プロセス4世代の結果を[継続記録](MCP-RUNTIME-CONTINUATION.md)へ結合。模擬Walletは不変、確認待ち表示への更新一回は残る。保存runtimeの起動ファイルは確認中で、実機や外部provider完成とはしない。
