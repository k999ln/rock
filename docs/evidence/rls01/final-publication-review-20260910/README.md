# 最終案内文と診断用 source copy の独立読取確認

2026-09-10 13:09 UTC。RQ-PREVIEW-INSTALL / RLS01 / C 表示確認。凍結候補を維持する原則で、案内の古い進行表記と copytree の追加生成物を区別した。既存 manifest・Git source・B observer・browser 証拠を再利用し、変更はこの証拠文書の追加だけ。合格指標は「宣言した文言以外の HTML bytes 変更 0、未承認 source 差分 0、継承生成物の内容差分 0」。`review-summary.json` が今回の入口である。

## Portable v2

元 `ba900e49c5ceac3f6453030518d75a0467c0f6ac` と v2 `26d2551c9fb8eef4b47f2cddfcb1fdeb07e7b82e` の各 9 ファイル、export manifest、対応する Git source 5 ファイルを独立照合した。両方とも `LOCAL_PORTABLE_PREVIEW_NOT_DEPLOYED`、dirty=false。同じ exporter で、動画・VTT・画像・2 CSS・README の 6 ファイルは byte 同一。

HTML の差は案内ページ 1 箇所とガイド 3 箇所の **4 個の完全一致文字列置換だけ**。案内の見出しは「QEMU・合成環境で検証済み」に統一され、ガイドの検証中・受入中の説明が内部検証済みに更新された。公開記録は公開条件確認後という制限を保持する。`site-export.json` は新しい source とページ hash を記録する metadata の変更。全 HTML のタグ・属性・コメント・宣言トークンは同一で、リンク先、native video controls、optional track と CSS は不変。v2 で文言の長さによる折返しを新たに視覚測定したとは主張しない。

`web-v2-proof.json` に全文字列対、全ファイル hash、構造 hash を保存した。製品ライセンス UNSET / legal NOT_CLEARED / 一般公開未開始を解除する証拠ではない。

## 元 ba900 の browser QA

`browser-ba900/` は元 source の CUA 観測原本を byte 同一で複製した。1512 px と 390 px のページ全体に横 overflow なし、guide の長いコマンドだけは自身の領域内で横スクロール。案内→最初の成果、復旧 anchor、guide→案内、開始 CTA を実操作した。

90.04 秒・720×960 の動画を native controls で再生し、10.375 秒の進行を確認。pointer seek 後の実位置は 23.885 / 54.078 / 69.984 秒で、引用整理の結果、合成 Wallet、完了済み Game A/B 履歴を画面確認した。HTTP は動画 200 / video/mp4 / 730404 bytes、VTT 200 / text/vtt / 630 bytes、VTT 4 cues と optional captions track を確認した。**native caption menu の選択と字幕の画面描画は NOT_CONFIRMED**。90 秒間全区間を再生したとは主張しない。

この QA の source は ba900 のままで、新 v2 の再生実測へ読み替えない。今回、媒体 bytes と HTML controls の同一性を追加確認した。自己所有 tab 48015117 は 12:57:08 UTC に閉じ、temporary viewport も戻した。新しい browser / VM / native / 金融試験は実行していない。

## Linux 診断用 overlay

`/var/tmp/rock-c-citation-selector-1213` を、final profile freeze SHA `d258a303794a3a16bbec792807bc39427fa3bf3ea3c3d86492be07948f1736fc` の **1364 source files** に対して照合した。元 `/var/tmp/rock-final-9abf78a` の 1364 files 自体も全て freeze と一致。overlay は 1363 files が不変、差分 1 file は B の承認済み host-only observer。

- `observe-pc-link-os.py`: 元 `06ef032b89751b707a07808b34d5956715724abd5e26ae0dc45d952926de3004` → B `58edfb30d45cde34367db2ba8e05b79d787e4040f9cd6c7c4f375dbaa06223df`。
- 新規 `test_pc_link_existing_citation.py`: `a001454d3021e97f3f328e8a9df98e423495cad7cc77f4617f6fc4648c1e729e`。元 source に存在しない 9-test file。
- 追加生成物 74 files は **65 Python cache + 9 元 base-build artifacts**。全て元 source 側の同じ path と byte 同一。全 path、サイズ、SHA は `overlay-proof.json` に列挙した。

overlay の regular files は 1439、追加は上記 test 1 + 継承生成物 74。source の不足、未知 source 差分、非 regular entry、継承生成物の内容差分は 0。これは **生成物を含む明示的な診断用コピー**で、pristine checkout ではない。継承 image は元 base build の生成物であり、最終 Game profile の配布 image と混同しない。過去の「extra file を一律拒否」した元 FAIL と OS 試験の元 FAIL は残し、この後続読取証拠で遡及的に PASS に変えない。

元 Linux unittest log は `prior-linux-tests.log` に byte 同一で保存（9 tests / 0.190 s / OK、SHA `baf17d06c46343595fea7b0ded196245d21f421584963ca04664988cfb98dac3`）。今回は再実行していない。読取は Python -B の標準 library のみで、対象 source から import せず、hash の前後で inode・size・mtime・mode が不変。filesystem の atime 更新までは禁止・保証しない。overlay、凍結 source、image、原配布 9 files の削除・書換えは行っていない。
