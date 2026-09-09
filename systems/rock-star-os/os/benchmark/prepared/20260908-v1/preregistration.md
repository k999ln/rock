# H2-OS: 実 ARM64 OS 内の 3 Tool と 1 Workflow の比較

**事前登録: 2026-09-08 09:22:48 UTC。測定はまだ行っていない。**

同じ Rock star os ARM64 ゲスト内で `trim_lines → unique_lines → sort_lines`
を独立した 3 Tool として実行する方式 A と、同じ処理を 1 Workflow にまとめる
方式 B の完了待ち時間を比較する。既存のホスト実験とは測定環境が異なる。
ホスト実験の数値との速度比、他 OS、人の作業時間、BlackBerry 実機、電池消費、
UI の使いやすさについては結論を出さない。

## 測定前に固定する方法

| 項目 | 固定した条件 |
| --- | --- |
| ゲスト | Linux ARM64、QEMU virt-10.0 / TCG / cortex-a53、1 GiB RAM、2 vCPU。凍結 Image と read-only rootfs、専用の新規 userdata を使用する。 |
| 競合負荷 | 親担当が他の build と QEMU を停止した専用実行期間に測定する。harness も開始・終了時の他 QEMU/build process、host load と VM 構成を記録する。 |
| 配布 | SDK の既存公開 RFC 8032 fixture で署名した独立 4 packages を、harness 所有の loopback TLS 9443 ストアへ登録する。OS の refresh/install/approve API で取得と承認を完了する。新しい鍵・本番 publisher 認証・外部公開は使用しない。 |
| 入力 | 8 語 `alpha, Bravo, りんご, 東京, zeta, 7, Ω, Ａ`、空白、空行、重複を含む固定 1,200 行。既存 H2 と同じ生成式、11,011 bytes。全試行で同じ bytes を使う。 |
| 出力 | 空行と既知の 8 語を Python の文字列順で並べた独立した期待値。両方式の完全一致と期待値への一致をすべて確認する。 |
| 実行者 | root の観測担当から分離した、継続動作する UID/GID 1000 client。測定では既存 Unix socket API と実 Linux namespace/seccomp sandbox を使用する。Hub や worker の実装は変更しない。 |
| 準備 | catalog 取得・4 package の取得/承認、health、環境/hash、Wallet 基準値を測定前に確認する。準備時間を性能集計へ混ぜない。 |
| 回数・順序 | warmup 3 組、その後測定 30 組。各段階で奇数組 AB、偶数組 BA。A は 3 job、B は 1 job、合計 132 job。回数を増減しない。 |
| 計時 | ゲスト `perf_counter_ns`。最初の run API 送信直前から最後の job.result の成功を観測するまで。署名検証、IPC、SQLite 記録、sandbox 起動、変換、結果取得、5 ms polling 待ちを含む。インストール・job 件数確認・サンプル保存・画面操作は計時外。 |
| 状態確認 | 各試行の前後に API が返す DB 全件 count の差を確認する。最後に root が SQLite mode=ro で全 job ID / key / package hash / input hash / status / 完全出力と実件数を独立に照合する。 |
| timeout | 測定中の API/1 job 完了観測は各 30 秒以内、warmup と測定の全体は 900 秒以内。準備は 180 秒、host のゲスト全体上限は 1,200 秒。測定中の自動再試行はしない。 |
| 集計 | 両方式の中央値、nearest-rank p95、最小、最大、ペアごとの短縮率中央値、B が A より遅い組数。外れ値除去なし。全 warmup・全測定値・失敗/不完全な値を保持する。 |
| 保全 | UTC 開始/終了、入力/期待値/4 package/事前登録/guest 実行ファイル/OS inputs の SHA-256、全サンプル、各 job、環境、根拠ログを保持する。実装/hash が前後で変われば無効。既存結果を上書きしない。 |

## 成功・停止条件

機能検証の完了には、warmup 3 組と測定 30 組すべての出力一致、各試行の実 job 数
A=3/B=1、全 132 job の成功、失敗/timeout/未完了がないこと、実行ファイルと
OS inputs の hash が不変であること、Wallet が変化しないことを要求する。

上の全条件に加え、B の経過時間中央値が A より短い場合だけ、**今回の QEMU 内
方式比較の条件に限って** H2-OS を支持する。中央値が改善しなくても正常に完了した
比較として全結果を報告し、仮説は不支持とする。有意差、信頼区間、最低実用差は
事前設定していないため、これらを後から達成したと主張しない。

出力不一致、job 件数不一致、失敗、timeout、残件、想定外の runtime/環境変更で
停止し、その時点までの全結果と理由を保存する。既知の実行中 job は既存 cancel API
で取り消す。結果が良くなった時点の早期終了や追加試行、外れ値削除をしない。
失敗原因を修正して再測定する場合は、新しい準備/証拠ディレクトリを使い、最初の
失敗を残す。方法を変える場合は変更点を測定前に追記する。

Workflow では段階別の実行履歴と途中段階からの再実行粒度が粗くなる。完了待ち時間
の短縮だけで、この運用上の違いや全ツールへの一般性を評価したことにはしない。
