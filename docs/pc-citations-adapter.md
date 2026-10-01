# PC出典整理の実処理接続 — C-PC01/C-PC02

この差分はPC専用。既存MCPの `format_citations` に渡した文章を、取り込み済みMR CLIの実プロセスで処理する。native配布物、Toolpackage、Wallet、vendor原本は変更しない。既存の他3商品と直接CLIの仕様も保持する。

## 呼び出しと制限

`mcp_server.execute → pc_citations.run_citations(text) → pc_citations_worker → execve(rock_star_tools.py citations --input 固定一時入力)`。引数は文章1件のみ。利用者のコマンド・実行ファイル・ファイルパス・出力先・environment・権限指定は受け取らない。既存のstdio、認証済みloopback HTTPの両方が同じexecuteを呼ぶ。

| 境界 | 実装 |
|---|---|
| 対応PC | macOS / Linuxの通常利用者。同一real/effective UID、root拒否 |
| Python | macOS 3.13以上、Linux 3.10以上。waitid/WNOWAIT非対応は起動前拒否 |
| 入力 | 空を除く最大65,536 UTF-8バイト。surrogate不許可 |
| 出力 | stdout 65,536バイト、stderr 8,192バイト。両方を同時drainし、超過・不正UTF-8・非zero終了で失敗。部分出力を成功として返さない |
| 時間 | spawn直前から3秒。最終drain、終了観測、decode後にも期限を確認。回収は追加で最大2秒。ホスト停止による実時間の保証ではない |
| OS資源制限 | CPU 2秒、core dump 0、file size 1MiB、FD 64。メモリ上限の強制は未実装 |
| 起動 | 固定Python、isolated mode、固定worker/CLI argv、shellなし、最小environment、新規process group |
| ソース | CLI、worker、引用原本、provenance、LICENSEを固定SHA-256で検査。通常ファイル・同UIDまたはroot所有・単一link・他者書込なし。検査した同じbytesだけをstage |
| 一時入力 | private directory 0700、入力0600、固定ソース0400。処理後に削除 |
| 同時実行 | MCPプロセス全体で1件。実行中の追加呼び出しを拒否。自動retryなし |
| 回収 | leaderをwaitid(WNOWAIT)で保持し、同じprocess groupの子孫を終了してからreap。確認できなければpoisonにし、次の処理を起動しない |

macOSの `os.waitid` はPython 3.13で追加されたため、従来の3.10条件とは異なる。[Python公式ドキュメント](https://docs.python.org/3/library/os.html#os.waitid)。Darwinのzombieだけを含むgroupへのkillpgがEPERMになる場合は、libprocの該当process groupの構成を確認してからleaderをreapする。

MCPの入力・出力schema（`structuredContent.output`）と4商品名は維持する。引用商品の入力上限は従来の100,000文字から上記UTF-8バイト上限へ縮小する。安全な有限診断だけを返し、原稿・子プロセスstderr・一時パスはエラーへ含めない。MCP終了要求はRPCが捕捉するSystemExitを避け、KeyboardInterruptで回収へ進む。spawn中のSIGINT/TERMは親がPopenを所有するまで保留し、その後に処理する。workerは継承した当該signal maskを解除する。

## 正規の取り込みを保持

取得元 `https://github.com/k999ln/Mr.`、commit `26a39d2c31ea5246cb78dbe42d86e333922db60c`。`vendor/mr/provenance.json` に保存した元の4ファイル、Git blob、MIT条件はそのまま。引用原本は `skills/writer-agent/scripts/_shared/citation-strip.py`、blob `5443c7632fea2dc110bbe246074ab3c3861f5ffa`。

| ファイル | SHA-256 |
|---|---|
| toolkits/mr/rock_star_tools.py | `42f138200a472a0351f9b61d5ba7a0b487b0cabff4d9b4e9b96312b55fbff40f` |
| vendor/mr/citation-strip.py | `ed5c28225402c5885c1265c0648b5d4d227a2345ca71e387275a8f205b4ffd13` |
| vendor/mr/provenance.json | `e782c0b741e9bcdcc3a591e2e6c3bcdaf5b03b51d08e77e4becf218b1e4cbd4f` |
| vendor/mr/LICENSE | `6cf38019109830262ffd5a3e1dca12e6e972c9750d2a68f99d5494d173960fac` |

## 合成入力による受入

公開fixture `systems/rock-star-os/os/tools/fixtures/citations.md`（150バイト、SHA-256 `bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e`）を使う。直接CLI、adapter、通常起動MCP、観測wrapper付きMCPの出力を完全一致で照合する。全経路155バイト、SHA-256 `30dafde5d3c32d7c690276656f8d5ed0ff924b2c9b5617ede86820efc0b1a0f6` が条件。native recipeの151バイト出力とは `---\n` の有無が異なり、同じ実装や完全一致とは扱わない。

`tests/mr_pc_probe.py` はhost試験専用の観測wrapper。通常modeは実際の固定spawnを呼び、子PID・親PID・終了・pipe閉鎖・一時入力削除を観測する。明示的な `term-fixture` modeだけは終了処理の負例としてsleep子プロセスに差し替える。配布zipには試験wrapperを含めない。

```sh
python3 -B -W error::ResourceWarning tests/mr_pc_adapter.py -v
python3 scripts/verify-pc-citations.py --output work/pc-citations-acceptance
python3 scripts/package-mr.py
```

受入出力先は新規directoryに限定し、report.jsonに実行環境、実PID、ソースと観測wrapperのhash、各出力hash、ソース不変性を残す。原稿は公開の合成fixtureだけを保存する。隔離candidateではmacOS（Python 3.14.7）とLinux（Python 3.13）の実19件がPASS、skip/ResourceWarningなし。macOSソース版・zip展開版とLinuxソース版の受入reportはすべて155バイト完全一致。既存を含むNode試験54件もPASS、skipなし。これらはローカル結果でありGitHub CIや公開済みの主張ではない。環境別reportを統合時の検証記録へ併記する。`npm test` に同じ負例群を含めるため、将来のCIで失敗やskipを成功に換算しない。

## PC側で完了しない範囲

この制限は信頼済み固定CLIのprocess境界であり、悪意ある第三者コードを隔離するkernel sandboxではない。同じUIDの権限は残り、mount namespace、通信遮断、強制memory limitはない。Windows新adapterは未対応。Ctrl+C・通常例外・正常なTERMは回収するが、親のSIGKILL・停電後の一時入力自動回収は未対応。

business idempotency key、durable accepted/running/done保存、crash後照合は未実装。RPCの同じidや同じ入力を再送すると新たな処理となる。既存のidempotentHintは副作用のない変換の性質を示し、exactly-once保証ではない。

native接続は別作業。`systems/rock-star-os/os/runner/store.py` の実行契約はrock-recipe/1に限定され、package identityをこのPCadapterへ渡す仕様はない。`systems/rock-star-os/os/mcp_broker/http.py` のnative protocolはPC MCPと異なる。Tool権限・PC capability・source identity・durable pre-dispatch claim・receipt照合・キャンセルとsandboxの契約を先に設計し、native/PC接続を実測する必要がある。現在のnative runtime `b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9` はこの差分で変更しない。
