# Rock OS 凍結候補 b8287bc — 受入・引継ぎ報告

**判定: INCOMPLETE。D0〜D5は下記のQEMU開発条件でPASS、D6はFAIL。** 最新の判定済み試験run43は、4正常終了・反復41/61件の後、Macの低電力休止と重なる区間でOCRと資源監視の期限を超過した。後続の通常終了・47 jobs/55 actionsの保持確認は別の成功であり、耐久合格には置き換えない。別の新規run44はAC給電・同じ期限と負荷で試験中（[保存時点の開始記録](evidence/os-base/44-start-b8287bc.json)）。run39/42/43の失敗は保持する。

これは [受入雛形](templates/os-acceptance-report.md) に基づく、既存証拠の独立照合と引継ぎ報告である。認証書、実機対応、実資金運用の保証ではない。試験実行・画面の目視確認は各元報告の担当者による。このレビューでは新しいQEMU、取引、ディスク変更を行っていない。

現在の機械記録は [受入JSON](evidence/os-base/acceptance-b8287bc-20260909.json)。[独立監査JSON](evidence/os-base/acceptance-audit-b8287bc.json)は**2026-09-09 22:35 UTC当時のsnapshot**について、101ファイル、凍結commitの778ファイル、業務・復元の実PNG179枚、報告間の参照hashとイメージ識別値を照合した記録である。その元監査は変更せず、今回追記したrun43や現在の受入JSON/source履歴の全文まで検査済みとはしない。後続43の原本hashと公開派生の対応は[43集約](evidence/os-base/43-summary-b8287bc.json)に別記する。当時16件の照合が通ったことは、D6の失敗を解消しない。

## 対象・承認・再現条件

| 対象 | 固定値 |
| --- | --- |
| repository / branch | `k999ln/rock` / `codex/operational-base-20260909` |
| 元main | `7cdbb5fedc86ee3978ed329d9312147d137c9199` |
| native統合入力 | `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5` |
| 承認設計 | v1.1 / `27b34adc02a9e06a4816aa18a5e38cf38b330953` |
| 統合commit | `797c663de60dcf4e7509c29de49447c3a521b90d` |
| **実OSのruntime** | **`b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9`** |
| 凍結OS用host補助ツール | `1a960756fbd5edc7f13a0578f3e7fc50025534c8`（pidfd観測修正を含む） |
| このレビューの証拠snapshot | `851081a45dd70580fdaa73c47e882eb51c3c4725`、clean |
| 初期GX00 host基礎 | `023976d6d5949b1fbce903e3faa89fc27a1fd18d`。上記OSには含まれない。後続差分は[保存時点](implementation-checkpoint-20260909.md)を参照 |

[実装承認記録](execution-approval-20260909.md) の記録日時は `2026-09-09T17:47:40.214265+00:00`。発言そのものの正確な時刻ではない。製品ベースv1.6/RQ01〜RQ15を保持し、実装開始を承認済み。公開・実機導入・MetaMask実資金は技術条件が整った対象への条件付き了承であり、実施済みという意味ではない。承認設計文書hashは `8daaf9d5109ce7e3d347e0166ec005c00ec4196c1b8b47d0c840d77a9765304e`。

[凍結manifest](evidence/os-base/freeze-b8287bc.json) は元Git archiveのcommitと778ファイルを記録し、今回その全bytesをGitの同commitと独立照合した。archive SHA-256は `96a449effab25c97f6280c06540803a6d7dac5f746c54d8fc21aadba93e1e88d`。ビルドに未記録のdirty overlayを加えた証拠はない。移植元の以前のdirty snapshotは [IMPORT-MANIFEST](../systems/rock-star-os/IMPORT-MANIFEST.json) に残し、旧hashを現在のファイルで書き換えていない。

| 生成物 | SHA-256 |
| --- | --- |
| Image | `a15eb83ce94adf1d067130d422e20bdd5538fda724eb816b4d8b9e79a1f52197` |
| rootfs.ext4 | `16742d4a5b4bbc6a960b8e59665a0660f58a7ff7618da1e115ec52d4193c8763` |
| stage0.cpio.gz | `3e4cbe79760ca1a95df75426a5780a95e55ca607d37c97e2d2031cf97b2ad55e` |

新しい空のLinuxビルド領域で、2026-09-09 19:00:17〜19:29:12 UTCに生成した。Debian 13.6 aarch64、host kernel 6.12.95、Buildroot 2026.08 / GCC 15.3.0 / musl、QEMU 10.0.11。専用Linux VMは4 CPU・6 GiB RAM・新規60 GiBディスク・host mountなしで、以前のVM/SSDを使っていない。通常guestはvirt-10.0・TCG・cortex-a53・2 CPU・1024 MiB、表示720×960。基本bootは64 MiB data、local A/Bの業務試験は256 MiB data。基本・業務・復元はNICなし、remote/store試験だけ所有するTLS fixtureへ接続した。

Buildroot 2026.08、Linux 6.18.50、dashの取得元・hash・ライセンスは [source-lock](../systems/rock-star-os/os/source-lock.json)。Linux署名検証の記録と、Buildroot/dashの署名を独立検証していない点を区別する。フォントは固定Noto CJK・OFL、既存Mr. CLIは固定Git source・MIT。各出所記録も監査hash一覧へ含めた。公開の開発鍵、ソフトウェア認証器、購入資格・provider fixtureは合成用で、本番の鍵保護や本人確認ではない。

Buildroot/Linux設定、依存lock、生成物一覧、build logのhashは凍結manifestにある。**別hostでのbit-identical再buildはNOT_RUN**。新しい空領域で作れたことと、別環境で同じbytesを再現できることは別の証拠である。

## D0〜D6の照合

以下のPASSは、記載した期待値と実測範囲に限る。元報告の作成当時のNOT_RUN/FAILは残したまま、後続報告を相互参照した。

| ID | 期待値と実測 | 判定・証拠 |
| --- | --- | --- |
| D0 | b8287bcのPython 1089実行とC core/platform/UI/IPCが成功、skip・不潔なtest logなし、試験入力不変。承認設計・元SHA・生成物固定を照合 | PASS。[source回帰](evidence/os-base/runtime-b8287bc.json)、[統合](evidence/os-base/integration-source.json) |
| D1 | 新build後に実ARM64 kernel/initを2回起動。ro root、別data、UID1000、IPC拒否・異常復帰、完全停止後の永続値保持。両boot logで`crng init done`を確認 | PASS。[boot](evidence/os-base/boot-b8287bc.json)、[boot 1原文](evidence/os-base/acceptance-basic-boot-1-b8287bc.log)、[boot 2原文](evidence/os-base/acceptance-basic-boot-2-b8287bc.log)。乱数初期化の記録であり品質認証ではない |
| D2 | native提案商品1.0→更新1.1→戻す1.0、同意・実行・結果/履歴・無効化/再同意・削除後の保存結果・再導入。16宣言操作・5 jobs。別2bootで合成Walletを操作し再表示、計4正常boot・171画面 | PASS（限定）。[業務計画](evidence/os-base/business-lifecycle-plan-b8287bc.json)、[実測](evidence/os-base/business-lifecycle-b8287bc.json)、[台帳/画面の受入](evidence/os-base/business-backup-acceptance-b8287bc.json) |
| D3 | 実platform65チェックで別UID、直接Wallet/IPC、path/通信、64 KiB入力、CPU/RAM/出力ファイル制限等を拒否。ATM34チェック・2bootでowner/actor偽装と重複を拒否、不明な払出しは保留。Hub3bootで実launcher crash/3秒deadline・同キーreceipt固定・明示的新キーの成功・再起動後保持。remote46・store33・registry拒否10件を実guestと所有TLSで確認 | PASS（限定）。[platform](evidence/os-base/platform-proof-b8287bc.json)、[ATM](evidence/os-base/atm-protocol-b8287bc.json)、[Hub異常復帰](evidence/os-base/hub-faults-b8287bc.json)、[remote](evidence/os-base/remote-b8287bc.json)、[store](evidence/os-base/store-b8287bc.json)、[registry拒否](evidence/os-base/registry-negative-b8287bc.json) |
| D4 | GUI readiness14、A/B8、中断/容量13、認証器health3、data ABI3の計41boot。未起動/freeze/crashのBを確定せずAへ復帰。署名/内容/slot改ざん、実部分書込、各保存境界の中断、実ENOSPC、正しく署名された異種ABIを拒否 | PASS（限定）。[5報告の統合](evidence/os-base/startup-update-acceptance-b8287bc.json)。公開開発鍵によるsoftware trustのみ |
| D5 | native電源UIの取消/reboot/poweroffを8画面・2bootで確認。業務+Walletの4正常終了、別復元先1boot/8画面、全A/B/dataの開始bytes一致、停止後6DBの全観測表比較、元/backup不変 | PASS（offline限定）。[電源UI](evidence/os-base/power-ui-b8287bc.json)、[正常init](evidence/os-base/normal-power-b8287bc.json)、[別先復元](evidence/os-base/backup-restore-b8287bc.json)、[目視受入](evidence/os-base/business-backup-acceptance-b8287bc.json) |
| D6 | 事前計画は5正常サイクル・61反復 jobs・3600〜4200秒。run43は4正常終了後、C4J40まで41件を記録。C4J41の画面入力中、OCR subprocessの10秒期限と資源sample期限を超過。Macの低電力休止2217秒を確認。run44は別の未判定試験 | **FAIL（環境中断）**。[43の集約](evidence/os-base/43-summary-b8287bc.json)、[固定計画の公開派生](evidence/os-base/43-plan-b8287bc.json)、[失敗報告の公開派生](evidence/os-base/43-soak-failed-b8287bc.json)、[電源記録](evidence/os-base/43-power-environment.json) |

D3の資源実測はaddress space 256 MiB、CPU 2秒、1ファイル1 MiBの元制限を使い、MemoryError / CPU終了137 / EFBIG / crash終了139を確認した。全ファイル合計容量quotaの証拠ではない。Hub異常試験は対象launcherを明確にした派生観測用rootfsで、既存runtime bytesを保持している。platform daemon全体の途中crash、すべてのエラー画面、複数owner/gameの成功経路をまとめて合格にしたものではない。複数owner/作者/gameの正当系は別GX00に属する。registryの公開停止は恒久署名失効であり、可逆のpause機能は未実装。

D2の必須「停止」は**無効化による以後の利用拒否と、明示的な再同意での再利用**として実施済み。処理途中の任意取消はNOT_RUN。元業務報告の`D2.whole_gate=INCOMPLETE`は任意取消を別に追跡しているため保存し、必須業務とWalletが通った範囲を後続受入報告で限定している。16操作は試験scriptが宣言する操作数で、人間のクリック数や作業削減量ではない。

Walletは2000 centsの合成売上を確定後、同月2要求でも888 centsの課金は1回。再起動後もavailable 1112、pending 0、held 0、更新同意停止、5 financial journals / 10 postingsを保持した。実処理の成功を売上に換えていない。ATMの別14画面試験では5000 credit・1000 hold・取消でavailable 5000/hold 0。quote/receipt/台帳の**Rock ATM手数料0**を確認し、コード再表示操作や実ATM actor操作は送っていない。外部の実費、実払出し、MetaMask残高とは無関係である。

後続CIはOSそのものの再buildではない。`057ea989434fbbca6723b4b8164aea8f05831a1e`のnative run **34410496387** はPython **1199**件、root observer61件、PIN11件等が成功。Web **34410496424**、Android **34410496472**も成功した。[CI記録](evidence/os-base/ci-057ea98-native.json) と [source履歴](evidence/os-base/operational-source.json) を凍結OSの1089件と分ける。後続の851081aはnative **34412876732**、Web **34412876810**、Android **34412876776**が成功した。[原報告](evidence/os-base/ci-851081a-native.json)はPython **1277**実行・14checks・skipなし・source不変。報告と全14logのhashも照合済み。これも新しいOS imageの受入とは別である。

## Macからの試用

[試用記録](evidence/os-base/mac-trial-20260909/mac-trial-acceptance.md)では、専用端末をMacのChromeから操作し、引用整理1.0の導入・明示同意・組込サンプル1件の処理、通常終了、同じ保存端末を再度開いた結果表示を確認した。入力は引用記号のない65 bytesなので、この試用の出力だけを引用整理による文章変換の証拠にはしない。提案業務とPC引用処理は別の上記記録で実測している。

2回目の終了監視は操作待ちが300秒を超えFAILを保存。その後の実画面による通常終了を、同じsessionの停止後検査で確認した。電源以外43表/schema/sequenceと全3receipt/1jobを保持し、電源1件だけ追加。元FAILと未観測QMP eventは埋めない。

3回目の実起動では、固定された専用listenerから同じ保存結果をChrome canvasへ開き、通常UI終了と停止後照合が通った。[最終Mac試用記録](evidence/os-base/mac-trial-20260909/final-mac-trial.json)と[実結果画面](evidence/os-base/mac-trial-20260909/final-result.png)に、終了観測29.774秒、実guest shutdown event、e2fsck終了0、非電源データ不変、1 job/3 receipts保持、旧電源2件＋新しい1件を記録した。2回目の失敗や、別試験D6の未合格を解消したとはしない。

## 保存・復元の範囲

復元は停止した`business-1764f9e8b3464681ab75`から、新しい`restore-business-1764-20260909`へ行った。schema6のnetwork-none local profile、backup/2。backup/1と/2の互換・追加表検出・排他はhost回帰で扱うが、今回実起動した形式は/2のみである。

| 対象 | 今回の保存・照合 | 限界 |
| --- | --- | --- |
| OS A/B/data | source/backup/復元開始時の3disk bytes全一致。元とbackupは復元後も不変、復元A/Bも不変 | dataは正常bootに必要な変化を伴うため、終了後全disk bytes同一とはしない |
| Wallet / membership / authenticator / Hub / local remote queue / power | 6DBのschema、全観測table、sequence、行hashを比較。実測表数は3+7+15+1+2+16=44。power以外は完全一致 | 比較器は追加表を除外しないが、**この実dataの追加表は0**。新ゲーム表の実保存は未試験 |
| 電源receipt | 旧4件保持、別bootの新しい正常shutdown1件だけ追加 | 電源要求受付だけで停止成功にしない |
| 設定・資格・public fixture | 起動前はdata全bytesへ含む。秘密値やDB原文を公開報告に記載しない | boot後の非SQLite file treeや未列挙DBは別途全件比較していない。暗号化や本番鍵復旧の保証なし |
| 外部Wallet backend / runner / game authority | この端末には設定がなくNOT_APPLICABLE。OS backupの保存対象外 | 設定/利用する場合は正本の別保存・新規復元・未確定receipt照合とwriter切替が必要 |
| hostソース・依存lock・イメージ | exact commit、freeze/出所manifest、hash、起動入口を引継ぐ | OS backupそのものにhost開発環境を含むとはしない |

元deviceの既存lifetime lockを復元試験・最後の元disk再照合まで保持し、復元先の停止読取りにもlockを用いた。通常停止7.33秒、guest eventとe2fsck終了0を記録した。これは同hostのoffline合成環境における元データ保護であり、古い任意backupからの復旧、外部正本の巻戻し、分散環境でのwriter昇格、同一authorityの二つの支出可能cloneを安全にする証拠ではない。

GX00 host移行/restoreは別runtimeである。新しいB/C registryの以前のcopyへ戻す復旧も未対応。GX00を凍結imageに後付けしたり、同じdata ABIなら旧slotへ戻せると推測したりしない。台帳変更を含む次候補ではD4/D5を再実行する。

## 失敗履歴と残課題

[run39](evidence/os-base/soak-stopped-socket-failed-b8287bc.json) は、正常停止の観測中に「PID identityが一致しないのにsocketが応答する」としてFAILした。その後、所有する小さいLinux pthread fixtureで、leader終了後に`/proc/PID/exe`が読めなくても別threadとsocketが残り、pidfdは最後のthread終了までreadyにならない仕組みを実測した。[機構証拠](evidence/os-base/pidfd-exit-mechanism.json) はこの可能性を示すが、39の原因を断定するものではない。

host補助ツールはidentity確認後のpidfdで全process終了を元の60秒期限内に待ち、閉鎖socketと停止diskのguardを維持した。[59 host試験](evidence/os-base/host-pidfd-business.log) が成功。42では4サイクルを正常に閉じたが、後のOCRで失敗したので、39を含むD6再試験が完了したとはしない。

run42の計画file SHA-256は `e36b5b9a17a0b2703797eea220a9f83a7eb535596463e31a74acd6c40203733d`、canonical JSON hashは `6cdd0789adb4d2dcf34dffe8eff49d2b0cec3713dc748d31897ef6762f093850`。後者がraw reportの`plan_sha256`と一致する。失敗raw report自身の`D6=NOT_RUN`は「最後まで実施しなかった」という元表示として残し、今回の受入結果はFAILとする。失敗時には所有guestが生存しており、raw reportは強制操作なしで保存されている。後続ではOSの電源画面から**8.30秒で通常終了**し、[正常終了記録](evidence/os-base/soak42-normal-close-b8287bc.json)と[停止後照合](evidence/os-base/soak42-closed-inspection-b8287bc.json)を別に保存した。C4J5を含む12jobs/20actionsの全input/output/receipt/audit、既存6jobs、Wallet等の非対象DB、A/Bを照合し、旧4電源receipt保持＋新しい1件、e2fsck終了0を確認。rawの失敗時`owned_device_running=true`は書き換えていない。

run43は同じ凍結imageと、OCR修正6ファイルだけを加えたhost payload `10961504c950726c2f445fca966b80f6bab32772d037b58b1f0ea153403367a8`を使用した。原計画file SHA-256は `22aab2f9597ed892b2cd73f2d13c6f51896709d23909671034f6298c62e26963`、canonical hashは `3d048948186de0d1dee442cd8689170ba94bb0eb0deee96936d4761cc2774e60`。原失敗報告SHA-256は `49de3dfdbecd5dbbf2eeed2a3f57e068f93b24af9e0c7b7c0af8a8c6fc4e7d0e`で、`status=FAIL`、`D6=NOT_RUN`、失敗時の`owned_device_running=true`を保持した。[公開失敗記録](evidence/os-base/43-soak-failed-b8287bc.json)はprivate pathと大量の入力/観測列を明示して省略・集約した派生資料であり、原報告そのものと同じhashとはしない。

Macの当該Sleep/Wake2行を読取り採録し、2026-09-09 **23:55:54 UTCに残量1%でLow Power Sleep、2217秒後の2026-09-10 00:32:51 UTCにAC給電で復帰**したことを確認した。[公開電源記録](evidence/os-base/43-power-environment.json)は時刻・給電・残量・休止時間だけを載せ、個人のWakeRequest等を載せない。この環境中断が観測区間と重なるため環境起因のFAILと分類するが、元のOCR/資源期限を免除したり、連続稼働を推定したりしない。

[失敗時の実画面](evidence/os-base/43-failure-input-b8287bc.png)は次のC4J41の入力処理中で、実行要求は未送信。C4J40までの41反復と前サイクル6件の計47 jobs/55 actionsは、後続の[通常終了](evidence/os-base/43-normal-close-b8287bc.json)と[停止後照合](evidence/os-base/43-closed-inspection-b8287bc.json)で保持を確認した。通常終了は**8.984秒**、実guest shutdown eventとe2fsck終了0、元4件の電源receipt保持＋新規1件、非対象DBとA/Bの一致を記録した。業務要求の再送・強制停止は行わず、この閉鎖/保持PASSをD6の成功へ付け替えない。

これ以外の最初のpublic build入力欠落、Wallet/ATMの古い座標・PIN golden frame、ABI serial観測、Hub補助processやpower request、業務OCRの失敗も、[source履歴](evidence/os-base/operational-source.json) と監査JSONのFAIL原報告で保存した。後続の限定成功へ書き換えていない。

| 残項目 | 今回の判定・次の条件 |
| --- | --- |
| D6 | 43は環境中断でFAIL、通常閉鎖と47 jobs/55 actions保持は別PASS。[host OCR修正](evidence/os-base/host-result-ocr.json)はconfidence45を維持。新規44は別device・同rkh15/同b828/同5サイクル・60分・61件・同期限/資源上限で試験中。AC給電とこの試験寿命だけの休止抑止を使用し、完了まで合格としない |
| GX0/GX1/GX2/GX3/DX | 凍結OSではNOT_RUN。後続hostには実TLSの本人接続endpointと限定client/管理引継ぎがあるが、GX00全体は未合格。通貨交換・一般作者SDKは未提供。逆方向は既定無効 |
| 実機H | Pixel 10 / GrapheneOSのAPK導入は別トラック、BlackBerryは型番未確定。実機boot/入力/電源/復旧はNOT_RUN。QEMU virt imageを端末へ書き込まない |
| MetaMask・実provider S・実資金P | NOT_RUN。既存Webアドレス接続は送信/受取receipt実装の証拠ではなく、native USD simulatorへの接続もない |
| 既存商品の価値B05 | PC同一150-byte入力→155-byte出力の3経路比較は別の限定測定。UI操作/切替はN/A、新MCP経路は速くなっていない。全体B05や実収益の成功を主張しない |
| 再現性 | 手順とsource/configは固定。別hostのbit-identical再buildは未試験 |

RQ01〜03/07はHub商品とWallet中心の設計と実native商品の利用を保持。RQ04/05/08は実行場所・料金・同意を分け、未接続の有料API/BYOK/全provider対応を表示しない。RQ06/15は合成整数台帳・月888・ATM自社fee0を実証した範囲だけ採用する。RQ09/10は旧SHA・失敗・承認・再開入口を保持。RQ11は実提案処理と限定PC測定まで、利用者の時間削減は未確定。RQ12はD6が未合格。RQ13/14のゲーム交換と作者導入は別未完了であり、今回置換・免除していない。

## 次の起動・停止・復旧・開発への引継ぎ

1. 凍結OSの再現担当は、既存checkout・deviceを上書きせず、**host補助ツールを1a960756fbd5edc7f13a0578f3e7fc50025534c8の別作業木**に置く。再buildする場合のruntime sourceはb8287bc。現在の023976d以降はhostにあるWallet sourceも変わるため、そのまま混ぜない。`service_access/profile.py`は埋込sourceとhost sourceを完全照合する。今回6 bindingの一致を確認しており、このguardを解除しない。
2. 同じ3イメージのhashを照合し、[local A/B手順](../systems/rock-star-os/os/desktop/LOCAL-AB.md) の新しいdevice名・network none・public fixture profileを使う。計画JSONの`config`は実profileの参照になるが、画像ディレクトリは新hostの場所へ明示的に合わせる。既存device名や保存diskを再利用して初期化しない。
3. native source rootから`python3 os/desktop/guest.py start < local-device.json`で開始し、返った実sessionに接続する。状態は`python3 os/desktop/guest.py status --name DEVICE_NAME`。`start`/preflight成功を実OSの受入成功とはしない。
4. 通常停止・再起動はnative「端末」の確認画面から行う。initのサービス停止/unmount、guest power event、全process終了、socket閉鎖、closed-disk/read-only整合を順に確認する。PID表示消失だけを停止とみなさず、socketやlockが残れば保存して原因を調べる。
5. 停止したlocal sourceは`python3 os/desktop/guest.py backup --name DEVICE_NAME`でbackupできる。別の未使用復元先への受入は`python3 os/desktop/verify-backup.py --source DEVICE_NAME --restored NEW_UNUSED_DEVICE`。同コマンドは実guest/UIの試験であり、元writerと正本の範囲を確かめてから実行する。外部正本を接続した復元には流用しない。
6. run39/42/43の失敗と、それぞれの後続閉鎖/保持記録を残す。run44は新しいdeviceで、同じ凍結image・host payload・負荷・閾値を使用して試験中。ACと試験中だけの休止抑止を確認し、計画、全sample、画面、失敗、各closed DB/receipt、終了状態が揃ってから判定する。試験の再開や電源復帰だけで失敗を消さず、全必須条件が通るまで「QEMU OS雛形合格」としない。
7. 開発は`codex/operational-base-20260909`の後続host/GX00側で継続できる。新しい台帳runtimeを配布imageへ入れる際は別候補として再buildし、signed ABI・旧client/旧OS・途中移行・A/B戻し・保留保持・別先復元を再検証する。凍結b8287bcの既存PASSを引き継いで新runtime合格とはしない。
