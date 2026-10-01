> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# Release gates — 全体は未完了

最新の確定結果は20:24 UTC追記とSERVICE-ACCESS-CONTINUATION（元snapshot内の参照。履歴資料は今回のGit対象外）、次の増分と13 Must/E2E差分はPURCHASER-RECOVERY-CONTINUATION（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。以下の15:39時点の判定と各増分の原本は履歴として保持する。実software認証や購入者OSの部分検証が進んでも、元の実機・provider要件を含むGoal全体を完了にしない。

2026-09-08 15:39 UTCまでの確定証拠を反映。**仮想ARM64 OSはbuild・起動・隔離・永続化・更新復旧まで実行済み**であり、「OS/ROMが存在しない」という段階ではない。一方、BlackBerry用BSP/実機対応、物理USB、passkey実認証、金融provider、端末外課金の本番運用などが残り、M1〜M5/添付DoDおよびGoal全体は未完了である。

現在はLinux 6.18.50、dash 0.5.13.5、公式修正適用済みPython 3.14.7の仮想ボード開発構成。56 + 45 Platform/Tool checks、Store 27 + 6、Remote API 34 + 12、A/B 8 + 13 boots、過去Power GUI 1058、ATM API 32 checks、最終1327のPlatform56+45とnative UI4系統/43原本画面、desktop実OS操作・offline backup復元の対応する原本は現在の検証索引（元snapshot内の参照。履歴資料は今回のGit対象外）にまとめた。異なるimage・host単体・実guest・simulatorを一つの合格数に合算しない。

| 条件 | 状態/証拠 |
|---|---|
| 3repo認証・固定HEAD・full tree | **調査範囲PASS**。07:12の全7368 tracked entriesを保持。14:08の認証付き再照合でも3 treesともtruncated=false、MrのHEAD変更は14:13にREADME同期metadata2行のみと照合。8,926他entries一致、追加削除0、機能/license分類と旧pin/HOLDを維持。最終差分（元snapshot内の参照。履歴資料は今回のGit対象外）、3repo再照合（元snapshot内の参照。履歴資料は今回のGit対象外）。Actions runの成功は未検証 |
| Mr全機能の意味監査・移植 | **未完了**。27機能群/246 scopeの根拠付き台帳、全path列挙と、全機能の本文レビュー/実装/動作同等性は別。9 submodule実体・nested license・未審査scopeを残す。unknown-license実装を取り込んだことにしない |
| OS0 build/boot | **仮想ARM64で検証済み**。独自rootfs/init/serviceを実kernelで起動。final-1327 boot（元snapshot内の参照。履歴資料は今回のGit対象外）。BlackBerry boot/flash可能な配布imageの証拠ではない |
| OS1 隔離・永続化 | **実仮想OS部分PASS**。別UID、SO_PEERCRED、保護data、Linux namespace/seccomp、no-NIC再起動後receipt、Wallet境界を実guestで確認。passkey、hardware device attestation、全tenant/実機policyの完了は別ゲート |
| OS2 更新・復旧 | **開発用A/B rootfs部分PASS**。final-1327の8 boot（元snapshot内の参照。履歴資料は今回のGit対象外） + 13 fault boot（元snapshot内の参照。履歴資料は今回のGit対象外）。改ざん、health失敗、電源断、実ENOSPC fallbackを確認。公開fixture trust、kernel/遠隔OS更新、hardware secure boot/antirollback、独立recovery OSは未完 |
| host全体・最新image再検証 | macOS **227件中4skip、実行223件PASS**、Linux **227/227 PASS**を各最終log（元snapshot内の参照。履歴資料は今回のGit対象外）で区別。final-1327ではPlatform56+45、native4系統/43画面（元snapshot内の参照。履歴資料は今回のGit対象外）、A/B通常8+故障13、ATM32、populated Wallet復元を再検証。異なるimageのStore0908/Remote1046試験を最終imageの再試験済みへ換算しない |
| 署名Store・権限・実行場所 | **開発fixtureでhost/実guest部分PASS**。固定HTTPS/CA、署名index・期限・失効、hash一致、明示承認、local-only拒否、明示remote入力同意あり。Store（元snapshot内の参照。履歴資料は今回のGit対象外）、Remote（元snapshot内の参照。履歴資料は今回のGit対象外）。公開鍵/認証fixtureは本番trust・作者本人確認・安全な鍵管理の代用にならない |
| Tool lifecycle / SDK | 独立packageの作成、投稿、OS直接取得・実行・v2・rollbackは実証。finite recipeの範囲でCoreやOS rebuildを伴わない。全既存repo機能の移植、任意第三者コード実行、本番作者審査は未完 |
| E2E-A 完全端末内 | **NOT RUN（実機全条件）**。仮想OS offline/lifecycle/sandboxはPASS。対象BlackBerry上のPC切断・直接取得・全復旧手順は未実行 |
| E2E-B Cloud | **NOT RUN（全条件）／部分PASS**。所有Debian TLS runnerで実isolated processと断線/応答喪失/再接続/no-NIC再起動PASS。PC不使用の端末Cloud構成、料金確認、全cancel/worker/tenant統合条件は未完。final-1327 native Remote（元snapshot内の参照。履歴資料は今回のGit対象外）で別同意・未送信破棄・応答喪失後の実行1件とdestination単tap回帰を確認。特定のread-inflightタイミングは別host guardの範囲。旧1253の2tap記録を保持 |
| E2E-C USB-PC | **NOT RUN（物理USB全条件）**。認証Unix transportと実workerのfixture試験あり。実USBのpairing・抜線再接続・pairing失効は未実行。要求値`pc_usb`を接続証明にしない |
| E2E-D Wallet→ATM | **NOT RUN（全条件）／SIMULATOR部分PASS**。one-time codeと原子的holdは実装済み、実OS2boot32checksでowner/ATM分離・UNKNOWN・partial/final・journal均衡PASS。最終ATM証拠（元snapshot内の参照。履歴資料は今回のGit対象外）。passkey実認証、金額/手数料に結び付く承認、全列挙障害case、provider/物理ATMは未完。native ATM owner 1326（元snapshot内の参照。履歴資料は今回のGit対象外）も実GUIで別確認→発行→現在状態→未消費取消、5受付/1credential/残高復帰を確認。コードは11原本画面・収集textに非掲載 |
| E2E-E 第三者配布 | **NOT RUN（全条件）／内部担当分離の部分PASS**。SDK→署名registry→OS直接取得→実行/更新/rollback。初見外部作者とは異なり、作者/料金/場所確認・全lifecycle・非互換/失効/失敗条件を同じE2Eで完了していない |
| E2E-F 購入者・月額888 cents | **NOT RUN（全条件）／SIMULATOR部分PASS**。引渡し情報のfixture継承、最小登録、初回継続同意、永続月次due/claimと既存Wallet課金、取消・再試行・実GUI台帳照合PASS。Wallet GUI（元snapshot内の参照。履歴資料は今回のGit対象外）。**開発用off-device Walletを統合し、実OS停止後の翌月888控除・NIC無しstale cache・再接続取消を3bootでPASS**。最終report（元snapshot内の参照。履歴資料は今回のGit対象外）。単一public fixture・試験時計・実Platform IPCの範囲であり、providerやGUI操作とは別。全追加case、実KYC/provider承認・passkey・実資金は未完 |
| E2E-G BlackBerryのみ | **NOT RUN（実機全条件）**。仮想OS/Hubは存在し直接downloadも実証。型番/variant/BSP/正規の書込み復旧手段・実機試験、PCなし初期設定から全操作は未完 |
| journal・不確定結果・機密コード | 既存Wallet台帳の均衡、重複防止、consumed後hold維持、累積確認による残額返却を実OSで確認。Wallet unavailableを偽のrejectedに変えず同key回復。生codeはprivate issuance receiptのみ、proofはhashのみ。暗号化retention/安全削除・本番secret管理は未実装 |
| 環境/依存security・ライセンス | Python公式修正の実適用、GCC guard実source、BusyBox影響applet除外、Dash照会を記録。SECURITY-INVENTORY（元snapshot内の参照。履歴資料は今回のGit対象外）。kernel1014候補中878はCNA版情報上非影響、136は未確認であり「136脆弱」でも「全安全」でもない。配布範囲/実機設定/残候補/第三者licenseを含む最終出荷審査は未完 |
| UX・製品価値 | native入力・Wallet・Power・遠隔実行、ブラウザ越しの実OS操作を仮想OSで確認。OS比較実験（元snapshot内の参照。履歴資料は今回のGit対象外）と過去host実験（元snapshot内の参照。履歴資料は今回のGit対象外）を区別。実人間の理解度、実機電池、既存OSに対する総合優位は未確定。desktop操作（元snapshot内の参照。履歴資料は今回のGit対象外）とoffline復元（元snapshot内の参照。履歴資料は今回のGit対象外）はPASS。旧復元は空Wallet。新populated復元（元snapshot内の参照。履歴資料は今回のGit対象外）でavailable4112/billed888/bill1/autorenew0/ATM0と32tableの保持、8画面、新boot・通常終了・clean ext4を確認。postboot全filetree/外部runner台帳・暗号化は未検証 |
| 本番提供 | **未実施**。BlackBerry flash、公開Store、production trust、実金融契約/決済/ATM接続は行っていない。開発用OS・公開fixture・simulatorを本番完成品として配布しない |

## 全条件判定の運用

E2E-A〜Gは元の定義（元snapshot内の参照。履歴資料は今回のGit対象外）の条件すべてで判定する。部分実装が進んでも、未接続providerや未実行hardwareを推測で埋めない。承認ボタンをpasskey実認証、Unix fixtureを物理USB、端末内schedulerを電源OFF中のbackend課金、担当分離を外部作者検証と呼び換えない。

金融未接続は実OSの起動・隔離・復旧の進展を否定しない。一方、仮想OSや金融simulatorの部分成功だけでM1/M2、M3〜M5または正式Goalを完了扱いにしない。法務・規制資料は実装の承認ではなく、実際の法域/主体/providerに対応する別確認である。

05:52 UTCの48件host/web/wheel、07:51以降のLinux 6.18.7、旧失敗試験の原本は検証結果の履歴（元snapshot内の参照。履歴資料は今回のGit対象外）に保持する。最新の確定reportと過去証拠の間で状態が違う場合、日時・image hash・試験範囲を併記する。


## 2026-09-08 16:20 UTC — OS 0.3.0 Tool safety continuation verified

正式Goal active。最初の8時間成果物とWallet継続成果物は固定保存を維持し、今回の更新は別のTool-safety-20260908に保存する。OS 0.3.0のrootfs SHAは `7e84a5262dfb9a5c411af29674d140239ff41c1426c29feaf2a01a3b93fd9f19`。source/target/ext4の同一性を確認済み。

- schema4最小OS/runtime宣言、全導入・実行境界の互換性拒否、native画面の必要版表示。既存schema2/3の署名済みToolは保持。
- 更新のDBと受付記録がcommitしてから子プロセスを停止。commit失敗では旧版の実行を継続し、停止signalの一時失敗は同key再試行で回復。
- 最終Linux全310件PASS（8.124秒、skip/例外thread/警告なし）、別Store TLS33件、Runner32件、nativeUI操作とIPC12件・証拠判定16件がPASS。最初の全体試験は3件失敗し、旧runtime hash記録・不正なmock manifest・試験子プロセス同期/cleanupを修正した。製品の3秒制限を延長していない。
- `os/registry/evidence/negative-final-1615/report.json`: 16:15:03–16:16:29 UTCの実ARM64起動で10件の具体的拒否、4実ジョブ、10永続受付を照合。future package GET=0、不正署名の拒否、TLS切断後の旧版保持、実ENOSPC後の同要求回復、権限追加後の再承認、入力ごとの遠隔同意、失効後のGET404。通常guest SHUTDOWN・clean ext4・Walletと入力image不変。検証強化前のnegative-1609は旧実行原本として保存。
- 固定imageの基本OS起動でPlatform56＋Tool45がPASS。新しいdesktop launcherで新規端末tool-safety-1604を起動し、標準native電源画面から終了。test hookなし、host power commandなし、3原本画面を目視確認、停止済みpower receipt1件とclean ext4を確認。

これは仮想ARM64開発版の証拠であり、全Must/E2E-A〜Gの完了ではない。BlackBerry機種未確定・実機boot/driver/電池/通信、物理USB、実passkey/KYC provider、実資金/実ATM、一般公開Storeと購入者運用、旧0.2 client向けcatalog交渉、可逆な配布停止/再開、外部作者による実運用確認は未完了。独立agentによるSDK作者役と実際の外部作者を区別する。8時間経過も、この部分検証のPASSもGoal completeの根拠にしない。


## 2026-09-08 17:09 UTC — 複数端末Walletの実OS検証

正式Goalはactive。最初の8時間枠と以前の3つの固定配布物を保持し、今回の追加成果物を `Multi-device-Wallet-20260908` に分ける。実機や全Mustの完成とは判定しない。

同一ownerの一つのauthorityで契約とWalletを共有し、immutableな `account_devices` と登録元記録を追加した。歴史的primary/account/Wallet binding/同意/請求/receiptは保持する。曖昧な旧複数契約は変更前に拒否する。端末ごとのv2認証設定は追記式で、設定欠落による旧モードへの復帰を拒否する。署名済み失効と各操作は同じStoreの認可guard内で直列化する。これは公開fixtureであり実passkeyやhardware attestationではない。

Linux全体338件、Store/Device/Bridge71件、ATM40件、計449試験実行がPASS。最終ログはskip・Traceback・thread例外・ResourceWarningなし。初回Mac sandboxのsocket拒否、新schemaを見落としたbackup証拠allowlist（32→34表）、試験fixtureのAPI/権限/8接続のclose不足を履歴に残し、必要な修正後に再検証した。最終記録は `artifacts/os/multi-device-continuation/test-summary.json`。

OS 0.3.0開発系列の新rootfsは `8bbcc317f875a5fb99ee586f16f73f267f72c1a0c97fd51701721f03a66dc2e8`、stage0は `fa473d48498f706963a6fb53e8d4fe10d362b0a559fc3386faf449efe4635360`。16:53:16 UTCの固定先 `/var/tmp/rock-os-multi-device-1654` でsource/target/ext4を照合。既定profileのPlatform56＋Tool45起動と実framebufferの目視確認がPASS。

新しい実OS3bootは `os/wallet_backend/evidence/multi-device-os-20260908T1704Z`。17:04:42.246265–17:06:55.660798 UTC、report SHA `a881a0f3e56ce311eb20f46f68f85ff7b29177bd39effc24873adfd04bbc3b5f`、wrapper exit0。別rootfs profile・別userdataのA/Bと、元userdataを使う失効Aの3distinct kernel boot。実UID1000 Platform IPC→TLS backendで、A登録/同意→一度の888控除・残高4112→A停止後の署名失効→B登録/同じ契約と履歴/共有取消→A旧cache非表示・旧receipt拒否を確認した。Aの新たな拒否済み要求は保守的にpending保持し、次の別bill keyはHTTP送信0。各guest正常終了・clean ext4、停止後の正本1account/2links/1billと4つのdevice receiptを照合。sourceと元imageは不変。直接kernel/rootfs起動でありstage0実行、同時2台、GUI操作、実ATM、BlackBerryの新規実証とはしない。

独立した実TLS試験では同時要求を一回の888控除に集約。ATM試験では交換端末が元のUNKNOWN保留を維持して照合し、原端末と元receiptを保持する。明確な端末失効でcacheを表示せず、未確定結果を破棄しない。不正/不足する成功応答で失効状態を解除しない。

現在の3クラウドrepoの16:28認証付きHEAD/tree再監査では前回から変更なし（Mr.8927 entries、rock292、blackberryrock38、全tree非truncated）。新規取り込みは不要で、以前の機能分類と採否根拠を保持する。

残る元の要件: BlackBerry機種・実機boot/driver/通信/電池、物理USB、実passkey/本人確認provider、購入者向けStore/Runner利用資格の統合、本番Store/backend運用・実金融provider/ATM等。旧client用catalog交渉・可逆な公開停止・外部の人間作者による追加受入は任意の改善として分け、元のMustに新しい条件を上乗せしない。次は元の認証要件に沿った試験authenticatorの実署名確認と購入者のサービス利用境界を優先する。


## 2026-09-08 18:38 UTC — Wallet署名認証の統合

実装済みのWebAuthn形式の署名検証、専用UID認証器、Wallet規約/月額同意の分離、quote拘束とatomic予約により、従来の単なるボタン承認から進んだ。ただし公開鍵fixtureのソフトウェア試験認証器であり、実hardware passkey/身元確認/実金融/実ATMは未達。BlackBerry・物理USB・購入者Store/Runner等の元Mustも維持。新規E2Eの部分PASSを全条件PASSや本番対応に変換しない。

今回の実装・検証・残る条件（元snapshot内の参照。履歴資料は今回のGit対象外）。最終結果と停止状態は同記録の追記を優先する。


### 18:54 UTC — 最終認証OSの結果確定

1830 imageのnative実画面12段階・19枚とstage0更新3bootがPASS。GUIは正常電源off・停止済み台帳一致、stage0はcommit保存直後の意図的中断と復旧を確認し、終了条件を混同しない。今回の最終Linux536試験と全7起動の範囲・hash・失敗履歴は確定記録（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。前の「検証中」を更新する。全Mustは未達でGoal active、既存4配布物は固定保持。


## 2026-09-08 19:54 UTC — 購入者Store/RunnerとE2E-Fの途中判定

Linux646件全PASSと新基底の既定OS61＋Tool45は部分証拠として採用した。購入者profileの実OS通信・新native操作・停止済み正本との結合はまだ確定しておらず、1949基底の初回再確認FAILも保持する。今回の詳細はSERVICE-ACCESS-CONTINUATION（元snapshot内の参照。履歴資料は今回のGit対象外）と実行原本を参照。

Storeは現在の購入資格、有料cloud新規実行は明示policyの支払い状態を要求し、基本OS・導入済みlocal Tool・自分のデータ・必要なWallet回復を未払いだけで閉じない。猶予0秒/自動失敗3回は検証用の既定値で、追加のMustや本番料金条件ではない。購入者失効と未払いを区別する。BlackBerry実機、物理USB、本番本人確認・金融provider・実ATM/資金等は引き続き元の未完要件であり、Goal全体とE2E-A〜G全条件は未完了のまま。既存5配布物は不変。


20:00 UTC更新: 購入者profileの実OS通信（元snapshot内の参照。履歴資料は今回のGit対象外）は原本と正本の結合までPASS。未払い/期限切れ/端末失効のStore・Runner境界とlocal継続、888一度を確認した。新nativeはまだ待ち、今回の直接kernel bootをstage0更新成功と呼ばない。OS停止中翌月請求の旧単一Wallet証拠は保持するが、複合authorityで新たに同じ系列を実行したとはしない。失敗履歴・実機/provider未達を含む全Must判定は維持する。


20:08 UTC 終了方法の訂正: 既定Platform検証（193943/195600）のS99 hookは `sync; poweroff -f` を使用する。kernel電源断とclean ext4の確認を、通常initによるサービス停止と呼ばない。raw invocationのlegacy `normal_shutdown:true` は保持し、独立reviewの訂正（元snapshot内の参照。履歴資料は今回のGit対象外）に初回記録を結合した。購入者OS195205は通常 `/sbin/poweroff`・unmount・guest QMP SHUTDOWNを別途確認済み。native電源操作の採用はまだ待ち。


20:10 UTC診断追記: 元の失敗filesystemを保持したまま私有コピーで取消receiptと1000 cents全額解除を確認した。正確な応答失敗の原因は未確定、元FAIL/unclean原本を保持し、資金状態の回復確認を正常終了や原因解消に換算しない。診断範囲と証拠（元snapshot内の参照。履歴資料は今回のGit対象外）を参照。


### 20:24 UTC — 購入者native部分合格、全体ゲートは未完了

実画面の独立review（元snapshot内の参照。履歴資料は今回のGit対象外）により、配布profileのStore閲覧/検索/詳細、未登録Wallet同期状態、通常UI電源終了を部分PASSへ更新した。Linux646、既定61＋45、実OS通信の購入/支払い/失効制御と1cloud/3local/888一度は別証拠として採用する。今回nativeにTool導入・実行・月額支払い・ATM取引の成功を加えない。8原本の初回検索不成立、host表示競合、195130の原因未確定FAILを保持する。

既定S99はforce hook、購入者IPC/nativeは通常init終了と区別し、新stage0 boot・複合authorityの端末停止中翌月請求はNOT_RUN。所有backend/開発VMは通常停止済みだが、実機・物理USB・本番本人確認/金融provider・実ATM/資金等を含む元MustとE2E-A〜G全条件は未完了のまま。公開fixtureの有料対象・猶予0秒・失敗3回を本番条件や新Mustとしない。5固定配布物は保持し、正式Goalはactive。

## 2026-09-09 04:22 UTC — 永続MCPの追加証拠

[継続記録](MCP-RUNTIME-CONTINUATION.md)でLinux1,003件と管理backend4世代、署名付きnative OSの再起動・同一結果・解除・通常終了を採用。所有HTTP/TLS・公開模擬資金の範囲で、外部MCP/OAuth・ToB精算・実機等の元Mustは未達。Walletの登録/課金同意は観測前のhost public fixtureであり、今回native同意証拠はMCP本文の送信だけ。起動直後の確認待ち表示には更新一回が必要だった。
