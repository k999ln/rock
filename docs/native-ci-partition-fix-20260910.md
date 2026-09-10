# 3d07df0のnative CI失敗と実行枠の分割

2026-09-10、利用者からCI失敗通知の画像と「問題解決して」を受領。対象は[run 34498721201](https://github.com/k999ln/rock/actions/runs/34498721201)、commit `3d07df03bac9cf0e03a0fe2b46b19aa5f2a9916e`。

## 原因として確認できたこと

nativeの最初のsuiteは600秒でexit124。676件の開始行があり、個別ERROR／FAILの行は0だが、suite全体の完了報告はないため未完了件を成功件数へ換算しない。後続13checksとroot UIは未実行。Web CIは成功した。

570秒時点のstackはMCPのTLS応答待ちを示す。そのケースは後にokとなり、終了時にはbackupの別ケースまで進んでいる。したがってこの原本は「1件の永久hang」の証拠ではなく、全体の累積実行時間が期限に達した証拠。成功1a2のnative入力697件とすべて同じで、同版の主suiteは1,392件／297.908秒だった。今回のrunnerが遅くなった詳細要因はこの記録だけでは確定しない。[原FAIL要約](evidence/native-ci-3d07df0/summary.json)と[原stack](evidence/native-ci-3d07df0/tests.stacks.log)を保持する。先行する1秒TLS ERRORの原因まで解明したとはしない。

## 修正

- 主suiteの全discoveryを4つの独立したGitHub jobへ分ける。module名の固定hashで割当て、同じmodule／classのfixtureと各枠内の元順序を保持する。同じtest IDが複数回発見される場合もordinalで区別して残す。
- 各主suiteの600秒、supportの300秒、通信・SQLite等の製品期限を維持。skip・自動retry・合格条件の緩和は追加しない。全件を一つのprocessで走らせる従来のローカル既定commandも保持する。
- 別jobで元の13support checksとroot UIを実行。最終の `source-tests` はすべてのjobの成功、同一source inventory、同一discovery、割当ての欠落／重複なし、全原ログhash・実行件数・cleanな終了を照合して初めて成功する。
- 原part report／log／stackをartifactに保持。主suiteを分割した集計は4＋13＝17checksとして記録し、旧14checksの単一process実績へ読み替えない。各テストの時間も別JSONLへ保存し、再び遅くなった場合に切り分けられるようにする。
- 変更はCIとhost試験用コードだけ。凍結9abのOS本体／同梱tools／配布9filesや既存データは更新しない。このCI修正を新OS buildやD0〜D6の再受入とは表示しない。

## 検証と再現

新規4testsと既存の診断7tests、計11件のMac上の対象検証に合格。欠落・重複・別source・FAIL・改変log・割当て変更・件数違い・support欠落を拒否することを確認した。

Linux ARM64で4枠（347／309／402／338件）とsupport264件、最後の集計は成功。元の1392件をordinalごとに保持し、新規4件を加えた1396件とsupportを合わせて1660件／17checks／skip0。全原ログとsource入力699件を独立照合した。[ローカル検証要約](evidence/native-ci-3d07df0/local-partitions.json)。`npm run verify`（API143 assertionsを含む）、`git diff --check`、workflow YAMLの読み取りも成功。修正commit `f88b392e3e2e2ec95a3bedb0d4fa5b4a195b6092` のGitHub検証も成功。主4枠＋support＋最終集計の6jobとWebが合格した。主4枠は32.815／68.473／101.388／116.423秒で完走。699入力・17原ログ・全discovery／割当て・root UI4ログをdownload原本で独立照合済み。[GitHub照合要約](evidence/native-ci-3d07df0/github-f88b392.json)、[native CI](https://github.com/k999ln/rock/actions/runs/34502833180)、[Web CI](https://github.com/k999ln/rock/actions/runs/34502833025)。各枠の入口は `python3 scripts/test-native.py --part main --shard-index 0 --shard-count 4 --diagnostic-stacks --output <新規dir>`（indexは0〜3）。supportは `--part support`。集計は `python3 scripts/test-native.py --merge-parts <全part artifactのdir> --shard-count 4 --output <新規dir>`。最終artifactの集計原本は `native-merged/report.json`、元partは `native-parts/` に保存される。

調査用の最初のローカルprobeはLimaのumask0002によるfixtureの権限拒否で中断。umask0022の別コピーでのprobeは1392件／125.366秒まで完走したが、probe自身のmain guard不足がspawn子processのEOFを1件生じさせたためFAILとして保持し、製品の合格証拠には使わない。正式な分割runnerにはmain guardがあり、既存の実process試験も各枠に含めて検証する。

CM制作完了、製品LICENSE／再配布条件、既存Sitesアクセス、実機・実資金の別ゲートは[前回の進捗記録](release-followup-20260910.md)を引き継ぐ。今回の600秒枠への集中に対するCI修正は検証完了。遅くなったrunnerの詳細要因や先行TLS ERRORの原因まで確定したとはしない。既存freeze validatorも17checks／1660件の集計原本を受理することを確認した。後続の証拠保存commitと、この修正sourceに対するCI実績は区別する。
