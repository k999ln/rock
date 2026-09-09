# 統合後のOS稼働検証 — 2026-09-09

main/native/設計v1.1を専用branchへ統合した。統合commitは `797c663de60dcf4e7509c29de49447c3a521b90d`。main・既存PR #1・元IMPORT-MANIFESTは変更しない。実装承認の範囲は[承認記録](execution-approval-20260909.md)、試験結果とhashは[機械可読記録](evidence/os-base/operational-source.json)。

## 現在の結果

| 対象 | 結果 | 範囲 |
| --- | --- | --- |
| Web統合回帰 | PASS | 54 unit tests、143 API assertions、型・lint・build・要件/進捗/正本検査 |
| Linux source回帰 | PASS | `b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9`、1089 Python実行、C core/platform/UIと実IPC・UI操作。入力hash不変、skip/warningなし |
| 操作・復元host追加回帰 | PASS / sourceのみ | `c7b29a9`の1119 Python実行とroot61件、skip/warningなし。版選択の実描画位置、OCR期限・停止後の排他観測、非空Walletの署名/888一度/ATM1000取消を追加。build runtimeはb8287bcのまま |
| startup health | PASS / sourceのみ | Python15件、root→UID1000の実Linux C8群。実nonce/socket/pidfd・loop応答を試験 |
| backup試験入口・local A/B | PASS / sourceのみ | Linux63件（35既存backup・15purchaser A/B・13local A/B）。2件は実ext4のlocal/purchaser分離。旧schema1、新schema2、追加表、外部正本の未検証表示を保持 |
| 全UI observer | PASS / sourceのみ | 現行enroll/Wallet terms/quote/approvalに合わせた55件を実Linux root fixtureで実行。skip/warningなし |
| 新規QEMU image | BUILD PASS / 起動試験中 | `b8287bc`を新しい空の領域で生成。778 source filesとarchive commit・設定・3 imagesのhashを照合して固定。2回の実起動/保存、Hub・Wallet・4資源拒否、通常initのreboot/poweroff、native画面の導入/許可/実行/履歴はPASS。実画面9枚と記録を照合。D0〜D6総合は進行中 |
| D0〜D6総合 | 未合格 | 上記source試験をOS稼働成功にしない |
| Pixel 10 | NOT_RUN | 利用者のGrapheneOSを保つ[Android P1 APK試験](android-trial.md)を準備 |
| BlackBerry・MetaMask実資金・外部game | NOT_RUN | 機種/技術/取引条件が未確定、MetaMask現行コードはアドレス接続のみ |

source試験は新しいDebian13 ARM64 VM、4 CPU、6 GiB RAM、60 GiBの新規disk、host mountなしで行った。旧VM・旧disk・SSDは使用していない。必要なext4ツールを見つけるため、guestのPATHには `/usr/sbin` を含める。

## 修正した理由

起動改善WIPは元21ファイルのhashを照合し、独立したPython/C試験を追加して候補へ採用した。画面の実描画後にloop応答を確認し、通常起動ではUIの応答なしにmark-goodしない。明示headless試験はUI確認済みと表示しない。実QEMUで未準備・freeze・crash・A/B復旧を通すまではN02全体を完了にしない。

backup/restore本体を置き換えず、古い検証器が要求していた `userdata_sha256` と44固定表の前提を拡張した。schema2の全disk、追加表、purchaser remote cacheとbackend正本の違いを扱う。外部backend/runnerの復元を実装・実行していない場合はINCOMPLETE/nonzeroを返すため、ALIGN03全体が完了したとはしない。

ATM/Wallet observerの古いfixtureは現在の本人確認と規約を満たさず失敗していた。現在の公開fixture認証器で実際に署名し、引用するquote・approval・手数料0・総引落し・台帳を再照合する。認証を無効化せず、PINとATMコードは公開証跡へ記録しない。月888 centsとATM独立を保持する。

最初の追加root試験はhandoff所有者とディレクトリ権限のfixture不一致で失敗した。修正後も終了コード0のログにSQLite未解放警告を発見したため未合格とし、allocation traceでpower試験用DBの2か所を特定してcloseを追加した。再実行55件は警告なし。これらの失敗を記録から除去していない。

GitHubの初回native CIは、試験用Pythonの所有者と10msの再試行時刻を壁時計に比較する試験の競合で失敗した。製品の所有者制限や待機時間を緩めず、保護されたsystem Pythonの実peerとcontroller限定の時計を使う試験へ修正。Linuxの対象15件・27件は合格し、`82faec4`のnative CI全体とroot55/C8群が再実行で合格。WebとAndroid P1のCIは合格し、署名・hashを確認した試用APK二本を取得した。Pixelでの実行は未確認。

local用の明示schema6はnetworkなしで署名済みImage/rootfs/stage0を固定し、A/B/data全体の既存backup2を再利用する。購入者schema5の外部正本をlocalと読み替えず、型違い・重複JSON・data-onlyへの取り違えを拒否する。63件のLinux試験はskip/warningなし。新しいOSの画面からの通常終了はPASS。非空Walletを含む全diskの新規復元先での起動はまだ未実行。

D3の固定診断は、実LinuxのUID1002→65534 sandboxでメモリ512 MiB要求を256 MiB上限で拒否、CPU2秒で終了、1 MiBを越える書込をEFBIGで拒否、明示crashを観測した。通常recipeと16項目の起動診断、未知引数拒否も保持した。同じ4ケースは凍結済みb8287bcの実OSでもPASS。Hubでのtimeout/crash状態回復とdata容量不足は別の受入結果を必要とする。

`2d9bd3a` CIのWebは生成済みproject.mdのcommit漏れで停止した。c7b29a9に同期差分を含め、同SHAのWeb/native/Androidすべてが再検証で成功。追加のWallet証拠6件はroot必須のため既存CIのroot observer段階へ配置し、非root source試験をskipで通さない。

[ゲームAPI草案](game-api-contract-draft.md)は認証principalから契約を選ぶ境界、専用署名receipt、GX00後の交換/SDK実装入口を整理した設計のみ。新規API・SDKは未提供。


実画面からの電源取消・再起動・終了は2回のkernel bootと8枚の元画像、保存済みpower receiptでPASS。serialには実initのサービス停止とext4 unmountも残る。模擬ATMの独立protocol試験も2起動34項目PASSで、結果不明時の保留維持、部分400/残600の照合、再送・再起動後の二重計上防止を確認。実ATM・実資金には接続していない。

実測で発見したhost試験器の不一致も保存した。Wallet旧座標は登録ボタンを外したため、実C描画＋認証有効Walletで14+14画面と8負例を確認した共通手順へ修正。業務試験器はQEMU初期640×480待機画面を早すぎて拒否し、正常終了ボタンの丸角がOCRノイズにもなった。元180秒/30秒・confidence45を維持した待機判別と輪郭補正はLinux/macOS40件、保存済み実画面/C描画7件PASS。更新試験では0444元imageの属性が派生コピーへ残って準備に失敗したため、新規0600 inodeだけへコピーするhost修正を実ext4と20件で検証。Hub障害fixtureは固定kernelにないproc children情報で停止し、観測側の対応を残す。これらの失敗をOS成功へ書換えず、同じ元imageで新規試験を行う。

## 残る実装と受入

1. 新imageの2回の実起動・保存、専用UID、read-only root/data、Hub/Wallet分離と資源拒否は確認済み。nativeチェックリスト商品の画面操作と通常initのreboot/poweroffも成功。Wallet登録/認証/同意/合成売上/月888一度/取消も実画面14枚と台帳でPASS。業務商品の全ライフサイクルを継続。
2. Hubで業務商品を取得・同意・処理・保存し、停止・更新・戻す・削除を画面から通す。版選択・停止・再承認の実装とC描画試験は完了し、実OSでの通過を残す。
3. 実画面Wallet/月額/ATM、更新障害、正常reboot/poweroff、新規復元先、5回の正常起動/終了と60分の反復稼働を同一候補で検証する。
4. [GX00 ADR](gx00-owner-isolation-adr.md)に沿って既存1契約1台帳の複数owner接続、復元時writer排他、ゲーム本人接続を実装する。現時点は設計のみで、ゲーム交換/SDKは未実装。

新imageへ変更が入ればsource SHAとimage hashを固定し直して関連受入を再実行する。実機への導入、一般公開サービス、実資金取引はsource合格だけで開始しない。

## 20:55 UTC 時点の追加証拠

`a02401bf1661d75446da858b48e6e90afd2ed263` のWeb・native source・Android CIはすべてPASS。[PC出典整理](pc-citations-adapter.md)は元CLIを変更せず実プロセスへ接続し、Mac/Linux各19件、元CLI・adapter・MCPの155バイト完全一致、配布版一致を確認した。nativeとの接続と永続的な再送照合は残る。

D4の実画面起動は14回PASS。正常2回と、未起動・freeze・crash各4回を同じ元imageで試験し、正常版Bの採用と、不応答版Bを2回拒否して元Aへ戻ることを確認した。5枚の元PPMを画素不変のPNGへ変換して目視照合した。改ざん・中断・容量不足・data ABIは別試験を続ける。

業務試験16では正常2サイクル、提案下書き5job、導入・更新・rollback・利用停止・再承認・削除・削除後履歴・再導入の16actionが実UIと停止後DBで一致した。ただし続く独立Wallet準備が登録直後のOCRで止まり、全runのFAILは保持した。確認した専用guestはその後UIから通常終了した。ATM実画面17も認証入力後の発行を25秒以内に観測できずFAILで、mask済みPINとボタン描画の同期を調査している。個別Wallet実画面14枚PASSとATM protocol34件PASSを、この新しい失敗試験の成功へ流用しない。

Hub障害試験18は実行対象のexe/argvだけが不一致で、その他9識別条件は一致。実Hub処理のLinux再現により、本体の前に正規の署名検証子が起動する順序を確認した。対象条件を緩めず、正規検証子だけを無信号で進めて本体を捕捉するhost観測修正を進める。凍結OS runtimeはb8287bcのまま。


## 21:30 UTC 時点の追加実測

凍結b8287bcのA/B更新8起動、容量不足・保存境界中断13起動、認証器のhealthと確定直後中断3起動が合格。GUI必須health14起動とは分けて記録する。更新データABI拒否の3起動はコンソール解析修正後の再検証中で、D4全体はまだ完了としていない。

Hubの3起動では、正規署名検証子を無信号で完了させた後に実launcherだけをSIGKILL/SIGSTOPし、失敗と3秒期限・同一keyの不変receipt・新規key成功・正常API終了・再起動後の全Hub/Wallet行保持を確認してPASS_SCOPED。これはGUIやplatform daemon停止の検証ではない。以前の失敗23はpower keyにコロンを使った試験コードの不一致で、元OSの許可文字制限を変えず固定keyを修正した。

PINの実masked4桁と有効buttonを元25秒内に観測するhost修正、実Wallet文字のOCR修正を統合した。Linuxの実CでWallet14/ATM14画面と座標8負例が合格し、業務Wallet45状態/23action/2UIプロセス、閉じた台帳5journals/10postings/15keysも一致。実OSのWallet付き新規backup元・新規復元先と60分稼働はこれから検証する。

B02-NATIVEとB03-FIXTUREの限定基礎は別報告で合格。複数owner/複数端末のGX00実装を隔離候補で並行して進めている。ゲーム交換/SDKや実資金対応の完成を意味しない。

## 22:04 UTC — 業務・Walletの4起動と新規復元先、通信断の実測

凍結runtime `b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9` は変更していない。host観測器 `28ebaf1` で新しい `business-1764f9e8b3464681ab75` を作り、全4回の通常起動/画面終了が PASS_SCOPED。提案下書きの導入・同意・実行・更新・戻す・停止/再同意・削除後の保存結果・再導入の16操作/5件を、実画面171枚と停止後の6DBで照合した。合成Walletは本人試験認証、明示同意、2000入金確定、月888を1回、更新停止、1000予約取消を経てavailable1112/held0、5journal/10posting/15操作キーを保持した。次の起動でも完全一致。試験器の任意項目である実行途中の取消時間はNOT_RUNのまま、原reportのwhole_gate=INCOMPLETEは書き換えていない。指定された「停止」は利用停止/再承認で実施し、D2必須項目の集約はPASS_SCOPEDとした。

その停止済みsourceから `restore-business-1764-20260909` へA/B/dataを新規復元。自動試験AUTOMATED_PASSに加えてrootが実画面6枚を確認した。5件の保存結果・導入済み1.0・更新停止・月888支払済み・試験残高11.12を表示。全6DBの全表/追加表/sequence/schemaを比較し、変化は4件の旧電源receiptを保持した上での新しい通常shutdown1件だけ。通常終了7.33秒、実guest shutdown、read-only e2fsck exit0。source/backupの全disk bytesが前後不変で、source lockは検証終了まで保持。D5はnetwork-noneのlocal Wallet deviceとしてPASS_SCOPED。外部backend/runner/game authorityを含む復元はこの試験の対象外で、成功を主張しない。

独立したremote試験も同一Image/rootfsの実2起動でPASS。新規owned TLS registry/runnerに対し、永続受付後の実応答半分切断、virtio NICの切断・再接続、no-NIC再起動を実行した。処理実体は2件だけで、未承認取消は送信0、Wallet/ローカル仕事への収益・実行追加0。production cloud/USBはNOT_RUN。

根拠は `docs/evidence/os-base/business-lifecycle-b8287bc.json`、同plan、`backup-restore-b8287bc.json`、`business-backup-acceptance-b8287bc.json`、`remote-b8287bc.json`。D4の41実起動とATM UI14実画面も完了済み。D6の5通常cycle＋60分反復と引継ぎ報告を残しており、OS雛形全体はまだINCOMPLETE。過去の失敗証拠を保存した。

## 公開b325767の同一source CI

[同SHAの記録](evidence/os-base/ci-b325767-summary.json)でWeb・Android・nativeをすべて成功と確認した。nativeは14検査・Python1341実行、skip/uncleanなし、元source不変と全log hashを照合。独立Node 22 wire verifierは303項目・142拒否を通過した。このsource CIは凍結b8287bcのOS受入や実機合格と別である。

その後のGX00基礎は[非空legacy](gx00-legacy-game-basis.md)と[C current-copy証拠API](../systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md)を追加。rootの実TLS2ケースとC API14ケースを確認した。旧WAL問題の失敗記録も保持し、現在ACTIVEのidentityだけをcommit済WALを読む検査へ修正した。source/adoption/初回copyは閉鎖条件を保つ。ゲーム側の明示handover・通常起動制限は次の統合であり、この段階のGX00全体は未合格。
