# B05 PC同成果・機械経路の限定比較

**2026-09-09 22:22:53–22:22:54 UTC、Mac実プロセスで15結果すべて完全一致。正常停止後の再起動/stdio再接続も全3経路で完了。新MCPの速度改善は確認されず、旧MCPより待ち時間が増えた。**

これはPCの同じ出典整理について、旧MCP・新MCP・既存CLIの機械経路を比べた結果。UI操作数・人間の切替/手動コピーはN/A。native Hub、QEMU、実機、外部API、費用/実売上、金融的exactly-once、実行中の強制停止、B05全体の合格を意味しない。

| 経路 | 初回セッション開始→結果（1回） | 接続済み反復の中央値（3回） | 正常停止後の再開→結果（1回） |
|---|---:|---:|---:|
| 既存PC CLI | 41.43 ms | 40.73 ms | 39.50 ms |
| 旧MCP（同一プロセスの既存商品関数） | 56.95 ms | 1.35 ms | 49.06 ms |
| 新MCP（固定CLI子プロセス） | 121.22 ms | 61.89 ms | 119.82 ms |

CLIは毎回新しい実プロセスを開始する。MCP初回はinitializeとtools/listを含み、反復は同じ起動済みstdio sessionのtools/callから完全な返答まで。すべて成果の完全一致確認までを計時し、結果ファイルの保存は計時外。実行環境のcacheを消していないので「cold disk」とは称さない。独立した大規模性能試験ではなく、3反復の記述値。p95/有意差/実機速度/人間時間の結論はない。

旧MCPの正常EOF→exit観測は5.98 ms、新MCPは7.34 ms。その後に新プロセスでinitialize/list/callを行い、元入力で同じ成果へ戻った。CLIの持続session/reconnectはN/Aで、完了済みプロセスの終了コード0を確認した後の再起動・再計算。合計9つの親プロセスはすべて終了コード0、stdout/stderrのpipeも閉じた。全raw stdout/stderrと15成果を保持する。新MCP内の子CLIの個別PID計測は速度観測への追加介入を避けるため実施していないので、この比較で観測した値として掲載しない。固定の実コードをそのまま起動し、子process/cleanupの詳細な機構証拠は既存C-PC01/02の19試験と区別する。

## 固定入力・出典

- 入力: 既存公開 `systems/rock-star-os/os/tools/fixtures/citations.md`、150 bytes、SHA256 `bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e`。
- 全15出力: 155 bytes、SHA256 `30dafde5d3c32d7c690276656f8d5ed0ff924b2c9b5617ede86820efc0b1a0f6`。コード内の出典例を保持し、本文の出典を末尾へ整理した同じMarkdown。出力を後から正規化して一致させていない。
- 旧MCP: git `05e834d1d3e06f1b8c5669361f549285cdb75765`。実在する旧版を現在の同じMacで再現した対照で、過去の日付の実測や旧native flowとは称さない。
- 新MCP/CLI: git `8b6a22acf40e1c975a65007d817bc72da465a5c6`。両版の `rock_star_tools.py`、vendor原本・provenanceは同じSHA。全exported sourceのGit blob/SHAはplanへ固定し、前後不変を照合した。
- 環境: macOS 15.7.4 arm64、Python 3.14.7、通常user。開始/終了load averageは4.3389 / 4.0811 / 4.0918。測定中にharnessが他の作業を停止したり、CPU/cache条件を特別に変更したりしていない。

## 事前固定と保全

[事前固定plan](evidence/hub-wallet/b05-pc-machine-20260909/plan.json) を商品実行前に保存しmode0444へ固定。SHA256 `9c560cddad284ecf0c5dcafc35e1ce1f6c69eac5d0e76986b1546b8cfe61ea68`。初回PAB、反復PAB/BPA/ABP、正常再開PABを事前固定した。source、入力、期待値、Python、runner hash、期限、回数、失敗停止条件を含む。自動retry、外れ値削除、追加試行は0。

[実測report](evidence/hub-wallet/b05-pc-machine-20260909/report.json) のstatusは `PASS_SCOPED_MACHINE_COMPARISON`、SHA256 `d3922afb9bc359a02ecdf85d74acd87d4befd47c293a7e4fafd6ce1202a22890`。[全sample](evidence/hub-wallet/b05-pc-machine-20260909/samples.jsonl) に15件の全時刻/elapsed_ns/PID/hash、[全出力/streams](evidence/hub-wallet/b05-pc-machine-20260909/evidence/) に全出力とraw streamsを保存（実invocation終了コード0）。sourceはすべて前後不変。既存root checkout・CLI原本は変更しなかった。

run-01は日本語ファイル名のGit export準備で停止し、商品実行0・計測0。原因をNUL区切りのpath取得へ修正し、同じdirectoryを再利用せずrun-02を新規準備した。[初回準備の失敗記録](evidence/hub-wallet/b05-pc-machine-20260909/preparation-01-failure.json)を残し、途中exportもprivate作業領域に保持している。

## 再現

[再現script](../scripts/measure-pc-citations.py)は、渡されたrepositoryの固定commitからsourceを新規directoryへexportする。既存成果先を上書きしない。runの前にplanを確認できる。

```sh
python3 scripts/measure-pc-citations.py prepare --repo /absolute/rock --output /absolute/new-private-run
python3 scripts/measure-pc-citations.py run --output /absolute/new-private-run
```

現観測は追加process境界の待ち時間を示す。新adapterの利点は許可された固定CLI、有限deadline、owned process cleanup等で、今回の数字から速度や操作削減の改善は主張できない。次は同じ既存Hub画面で初回接続・入力・保存/再表示・PC停止/再接続を実測し、画面上の詰まりと実際の操作数を調べる。native151-byte引用や提案35の時間、旧H2の132jobs/3Tools対Workflowの速度はこの表へ混ぜない。
