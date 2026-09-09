# 統合後のOS稼働検証 — 2026-09-09

main/native/設計v1.1を専用branchへ統合した。統合commitは `797c663de60dcf4e7509c29de49447c3a521b90d`。main・既存PR #1・元IMPORT-MANIFESTは変更しない。実装承認の範囲は[承認記録](execution-approval-20260909.md)、試験結果とhashは[機械可読記録](evidence/os-base/operational-source.json)。

## 現在の結果

| 対象 | 結果 | 範囲 |
| --- | --- | --- |
| Web統合回帰 | PASS | 53 unit tests、143 API assertions、型・lint・build・要件/進捗/正本検査 |
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

local用の明示schema6はnetworkなしで署名済みImage/rootfs/stage0を固定し、A/B/data全体の既存backup2を再利用する。購入者schema5の外部正本をlocalと読み替えず、型違い・重複JSON・data-onlyへの取り違えを拒否する。63件のLinux試験はskip/warningなし。新しいOSでの通常終了・復元後起動はまだ未実行。

D3の固定診断は、実LinuxのUID1002→65534 sandboxでメモリ512 MiB要求を256 MiB上限で拒否、CPU2秒で終了、1 MiBを越える書込をEFBIGで拒否、明示crashを観測した。通常recipeと16項目の起動診断、未知引数拒否も保持した。実OS内の4ケースと、Hubでのtimeout/crash状態回復、data容量不足は別の受入結果を必要とする。

`2d9bd3a` CIのWebは生成済みproject.mdのcommit漏れで停止した。c7b29a9に同期差分を含め、同SHAのWeb/native/Androidすべてが再検証で成功。追加のWallet証拠6件はroot必須のため既存CIのroot observer段階へ配置し、非root source試験をskipで通さない。

[ゲームAPI草案](game-api-contract-draft.md)は認証principalから契約を選ぶ境界、専用署名receipt、GX00後の交換/SDK実装入口を整理した設計のみ。新規API・SDKは未提供。

## 残る実装と受入

1. 新imageの2回の実起動・保存、専用UID、read-only root/data、Hub/Wallet分離と資源拒否は確認済み。nativeチェックリスト商品の画面操作と通常initのreboot/poweroffも成功。業務商品の全ライフサイクルとWallet画面を継続。
2. Hubで業務商品を取得・同意・処理・保存し、停止・更新・戻す・削除を画面から通す。版選択・停止・再承認の実装とC描画試験は完了し、実OSでの通過を残す。
3. 実画面Wallet/月額/ATM、更新障害、正常reboot/poweroff、新規復元先、5回の正常起動/終了と60分の反復稼働を同一候補で検証する。
4. [GX00 ADR](gx00-owner-isolation-adr.md)に沿って既存1契約1台帳の複数owner接続、復元時writer排他、ゲーム本人接続を実装する。現時点は設計のみで、ゲーム交換/SDKは未実装。

新imageへ変更が入ればsource SHAとimage hashを固定し直して関連受入を再実行する。実機への導入、一般公開サービス、実資金取引はsource合格だけで開始しない。
