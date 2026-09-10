# ba900 native CI の停止位置と任意の追加観測

対象は GitHub run 34478360425、source `ba900e49c5ceac3f6453030518d75a0467c0f6ac`。原本は `work/final-handoff/ci-ba900-native-artifact/native-tests/` に保持。主 `tests.log` SHA-256 は `061376d0a7ce2d6a9cf4b013827b2b49a04d74003d2676099212f4681c0e8b78`。

原ログは 231 件の `... ok` の後、`test_game_legacy_basis.LegacyGameContinuity.test_adopted_original_rows_then_real_three_device_four_game_connections` の結果が出ず、親の既存 600 秒期限で exit 124 となった。約 600 件が通ったという初期推定ではない。unittest は setUp の前に名前を表示するため、この終端だけでは setUp、本体、cleanup の位置は判別できない。原 report は FAIL のまま。スレッドスタック、個別 RPC 時間、待機中 lock の情報はない。

`9abf78a80d27aa9f847c4051d20e4c552e407276` と ba900 の間で、`tests/game_legacy_basis.py`、`tests/test_game_legacy_basis.py`、`os/wallet_backend/`、`os/entitlement/`、`os/game_exchange/`、`os/runner/transport.py`、`scripts/test-native.py` に Git の byte 差分はない。A の別 run で同じ 9ab の全 native R2 が 13:02:34 UTC に 1,631 executions / 14 checks / skip 0 で PASS、問題の 2 ケース名も OK と報告された。この別合格で先の FAIL を置換しない。

ソースから確認できる待機位置は次の通り。いずれも今回そこに滞留した証拠ではない。

- `tests/game_legacy_basis.py:80` の cleanup は `server.shutdown()` の後に 5 秒 join、その後 `server_close()`。shutdown 自体と non-daemon worker の終了待ちは、その 5 秒 join では制限されない。
- 同 `:273` の scheduler 照合は 3 秒の期限を持つが、ループ条件内 `business_evidence()` (`:256`) が admission を獲得して戻った後に期限を評価する。admission 待ちの最中をこの assertion は観測できない。
- `os/wallet_backend/server.py:197` は non-daemon worker / block_on_close。request timer は socket を閉じるが、admission や SQLite の実行を強制中断するものではない。
- fixture の TLS transport は `tests/game_legacy_basis.py:94` で 3 秒。別 e430 エラーの 1 秒 owner transport と混同しない。

lock の相互待ち、FD 枯渇、fsync 遅延、負荷が原因であるという裏付けはない。Runtime や fixture の修正は行わない。

次の観測だけを任意で追加する D worktree commit は `5bae600d8971a188f8dc4bb7ca31705e2cfeedfd`。`scripts/test-native.py --diagnostic-stacks` が、元の Python flags を保持した runpy trampoline を使い、既存 600 / 300 秒期限の 30 秒前に faulthandler の全 thread stacks を一度、別の 0600 sidecar に出す。sidecar は既存ファイル・symlink・hardlink を上書きしない。ローカル変数を出力しない。Python interpreter の non-daemon thread 終了待ちも対象とする。C process の stack は対象外。

既定 flag なしの argv / env / 期限 / SIGKILL / exit 124 / log_result と元のケース・assertion は保持。flag 使用時は元 command と実 trampoline command を report 内の別 fields に記録し、sidecar の byte 数と SHA-256 を保存する。診断が出たこと自体は失敗にも成功にも換算しない。再試行、timeout 延長、mock 化はない。root と frozen 9ab は変更していない。

対象の新しい 6 tests は実 child process を使い、script / module の引数・import・stdout、元失敗 exit、blocked thread と interpreter shutdown wait の stack 採取、private mode と sidecar hash、既存 file / links の非上書きを確認した。Mac 6 tests / 2.258 秒、専用 Linux `/var/tmp/rock-native-diagnostic-tiny-20260910` で 6 tests / 2.176 秒、いずれも PASS。全 native の再実行や VM 起動は行っていない。
