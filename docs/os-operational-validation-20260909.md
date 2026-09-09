# 統合後のOS稼働検証 — 2026-09-09

main/native/設計v1.1を専用branchへ統合した。統合commitは `797c663de60dcf4e7509c29de49447c3a521b90d`。main・既存PR #1・元IMPORT-MANIFESTは変更しない。実装承認の範囲は[承認記録](execution-approval-20260909.md)、試験結果とhashは[機械可読記録](evidence/os-base/operational-source.json)。

## 現在の結果

| 対象 | 結果 | 範囲 |
| --- | --- | --- |
| Web統合回帰 | PASS | 53 unit tests、143 API assertions、型・lint・build・要件/進捗/正本検査 |
| Linux source回帰 | PASS | `f3ec84386421fa3363959b448f9a2a7c71f21ef8`、1056 Python実行、C core/platform/UIと実IPC・UI操作。入力hash不変、skip/warningなし |
| startup health | PASS / sourceのみ | Python16件、root→UID1000の実Linux C8群。実nonce/socket/pidfd・loop応答を試験 |
| backup試験入口 | PASS / sourceのみ | 35件。旧schema1と新schema2、A/B/data、profile別DB・追加表・外部正本の未検証表示 |
| 全UI observer | PASS / sourceのみ | 現行enroll/Wallet terms/quote/approvalに合わせた55件を実Linux root fixtureで実行。skip/warningなし |
| 新規QEMU image | IN_PROGRESS | `dea78e3`から空のLinux build領域で開始。実起動・更新・復旧はまだNOT_RUN |
| D0〜D6総合 | 未合格 | 上記source試験をOS稼働成功にしない |
| Pixel 10 | NOT_RUN | 利用者のGrapheneOSを保つ[Android P1 APK試験](android-trial.md)を準備 |
| BlackBerry・MetaMask実資金・外部game | NOT_RUN | 機種/技術/取引条件が未確定、MetaMask現行コードはアドレス接続のみ |

source試験は新しいDebian13 ARM64 VM、4 CPU、6 GiB RAM、60 GiBの新規disk、host mountなしで行った。旧VM・旧disk・SSDは使用していない。必要なext4ツールを見つけるため、guestのPATHには `/usr/sbin` を含める。

## 修正した理由

起動改善WIPは元21ファイルのhashを照合し、独立したPython/C試験を追加して候補へ採用した。画面の実描画後にloop応答を確認し、通常起動ではUIの応答なしにmark-goodしない。明示headless試験はUI確認済みと表示しない。実QEMUで未準備・freeze・crash・A/B復旧を通すまではN02全体を完了にしない。

backup/restore本体を置き換えず、古い検証器が要求していた `userdata_sha256` と44固定表の前提を拡張した。schema2の全disk、追加表、purchaser remote cacheとbackend正本の違いを扱う。外部backend/runnerの復元を実装・実行していない場合はINCOMPLETE/nonzeroを返すため、ALIGN03全体が完了したとはしない。

ATM/Wallet observerの古いfixtureは現在の本人確認と規約を満たさず失敗していた。現在の公開fixture認証器で実際に署名し、引用するquote・approval・手数料0・総引落し・台帳を再照合する。認証を無効化せず、PINとATMコードは公開証跡へ記録しない。月888 centsとATM独立を保持する。

最初の追加root試験はhandoff所有者とディレクトリ権限のfixture不一致で失敗した。修正後も終了コード0のログにSQLite未解放警告を発見したため未合格とし、allocation traceでpower試験用DBの2か所を特定してcloseを追加した。再実行55件は警告なし。これらの失敗を記録から除去していない。

## 残る実装と受入

1. 新imageの起動、専用UID、read-only root/data、native画面とIPCを確認する。
2. Hubで業務商品を取得・同意・処理・保存し、停止・更新・戻す・削除を画面から通す。旧UIの最新版のみ表示と停止操作の不足を埋める。
3. 実画面Wallet/月額/ATM、更新障害、正常reboot/poweroff、新規復元先、5回の正常起動/終了と60分の反復稼働を同一候補で検証する。
4. [GX00 ADR](gx00-owner-isolation-adr.md)に沿って既存1契約1台帳の複数owner接続、復元時writer排他、ゲーム本人接続を実装する。現時点は設計のみで、ゲーム交換/SDKは未実装。

新imageへ変更が入ればsource SHAとimage hashを固定し直して関連受入を再実行する。実機への導入、一般公開サービス、実資金取引はsource合格だけで開始しない。
