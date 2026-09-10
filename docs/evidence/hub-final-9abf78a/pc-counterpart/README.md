# 同じ native 引用 recipe の PC 処理測定

RQ01–11 / 0→1・秘密を探す / 異なる商品の成果を比較して改善と誤認する問題 / 凍結済み recipe worker と公開 sample / PC側は同じ処理の新規 process 呼出だけ / 成果 bytes と機械時間 / 独立 pins、事前 plan、全5回の exit と出力 hash。

配布候補 `9abf78a80d27aa9f847c4051d20e4c552e407276` の3ファイルを Gitから取得し、独立固定の freeze `d258a303794a3a16bbec792807bc39427fa3bf3ea3c3d86492be07948f1736fc` の inventory と照合した。同梱150-byte sampleに、既存 `organize_citations` recipeを新しいPython processで適用した。5回すべて151-byteの成果 SHA `e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7` と一致した。期待値は先行する実native Linuxおよび取得版OSの停止後readbackで確定した値で、比較時に出力を正規化していない。

測定済みの機械時間は初回33.812375 ms、反復29.143125 / 30.940125 / 30.841792 ms（中央値30.841792 ms）、正常終了後の新process29.021292 ms。区間はprocess作成直前から正常exit・JSON復号・出力完全照合までで、証拠のfile保存を含まない。Mac arm64 / Python3.14.7で、OS cacheのflushは行っていない。準備・人の操作・画面切替・手動copy・実OSの隔離機構はこの区間に含まれない。

これは**同じnative実装のPC側機械処理**である。別商品契約のMr. CLI、既存の155-byte比較、利用者が普段使うPC手順と同一視しない。旧15成果一致・新MCP速度改善なし・人間操作未測定の結果も維持する。最終OSのUI操作数・待ち時間はその原操作ログから別に算出し、UIを含まない本値との差を操作時間削減率として表示しない。

最初のrunはstdout/stderr保存をtimer停止前に行っており、事前planの計測区間と不一致だった。元plan/report/outputを保持して [timing-scope-correction.json](timing-scope-correction.json) に原因を記録し、保存前にtimerを止める修正後、別ディレクトリのrun-02で測定した。run-01の成果一致は有効だが、その時間を本結果へ採用していない。製品sourceは不変。

- [採用した事前plan](run-02/plan.json)、[元report](run-02/report.json)、[151-byte成果](run-02/first-process.md)
- [最初のplan](run-01/plan.json)、[最初のreport](run-01/report.json)、[全原本hash](original-files.json)
- 実行器: `scripts/measure-native-citation-path.py`

再現は独立取得したfreezeを指定し、未使用の出力先で `python3 -B scripts/measure-native-citation-path.py --repository . --freeze <freeze-manifest.json> --output <new-directory>`。Wallet、Game、遠隔runner、実金銭は操作しない。人のactive時間・画面切替・手動copyはnull、時間削減の実証はfalseのままである。
