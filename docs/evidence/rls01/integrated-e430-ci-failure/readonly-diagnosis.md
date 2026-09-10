# e430 CI34477407336 期限エラーの静的診断

元source `e430648c8ba799d004a5ecd0da8166ca811d3ae5`、artifact `ci-e430-native-artifact/native-tests/` をread-onlyで確認。**確定したruntime/fixture根本原因は特定できない**。期限変更・再試験・VM操作はしていない。

確定した失敗境界：

- `tests.log:1418` の1 ERROR。main1385件/446.608秒、全体1649実行の原reportはFAIL、source_unchanged=true。
- `test_game_connections_tls.py:436` の A/B 接続準備ループで `begin()` は返り、`approve()` 内の本人署名生成も返った後、owner HTTPS RPC が失敗。A/Bのどちらの反復かは原ログに記録なし。作者失効と `restart()` は次行であり未到達。
- `wallet_backend/client.py:144` の HTTP response status line 待ちから `runner/transport.py:98` の TLS `recv()` に進み、`TimeoutError: The read operation timed out`。request送信を試みた後なので既存clientは `BackendUnavailable` と分類する。未送信・承認拒否・未commit・二重処理のいずれとも断定できない。
- fixtureは owner transport の timeout を省略し、既定1.0秒の接続開始からの総期限を使う。server側3秒とは別の既存契約で、clientの予算を3秒へ延長する根拠ではない。HTTP header待ち時点の残時間、server admission/署名検証/SQLite commit/response送信の所要時間は原ログにない。
- 該当fixture・client・deadline transport・server・Game connections/protocolの6ファイルは最終配布9abとe430でbyte同一。追加observerコードの変更が該当runtimeへ直接入った形跡はない。source同一は環境・テスト間状態・実行時間が同一という証拠ではない。

記録が不足しているため、host負荷、fsync遅延、TLS scheduling、C lock待ち、server例外/応答喪失のどれかを根本原因と断定できない。原traceは権限guardや接続期限の明示拒否とも異なる。今の証拠だけからruntime修正・fixture猶予延長・自動retryを提案しない。

今後原因を狭めるなら、同期限・新fixtureを維持し、失敗したgame/key、RPC開始/TLS接続完了、server認可入場/署名検証/commit/返信開始の単調時刻、停止後の同request状態を観測者側で残す必要がある。このnoteでは実行していない。最新ba900 CI、Aの別9ab local-native-R2、配布9abの既存x86_64 CI PASSは、それぞれ別source/runとして集計する。

原log SHA256: `b6afdedb9873483c88ee5819304cbe4dc5088037fea9c9491c944af56b25b0e0`。

6ファイルのGit/CI入力対応（artifactの正確な入力集合へ照合）：

| path | SHA256 | e430 CI input一致 |
| --- | --- | --- |
| `systems/rock-star-os/tests/test_game_connections_tls.py` | `818d9228e87b0f79b1181ea31679fa8dbd01ef6f759787b7aeb52a5bf4c6c324` | True |
| `systems/rock-star-os/os/wallet_backend/client.py` | `50cc2721f9a6fd9af07217f8aec7196b2fa603cac8ce6ccfae862117acce8597` | True |
| `systems/rock-star-os/os/runner/transport.py` | `0fd48c060e8ff2742c5b387b57495e2cbba45c99bcca952d8254e1ac3ea906e6` | True |
| `systems/rock-star-os/os/wallet_backend/server.py` | `ebcc1f349699d1f2cdc95e05101bfe9417d1fb27671f0a4f2582dd401274a7fb` | True |
| `systems/rock-star-os/os/game_exchange/connections.py` | `f9683b385883a51f808a22161643878e3c71771610156793bda9e4146a1b63a5` | True |
| `systems/rock-star-os/os/game_exchange/protocol.py` | `d58009bf97a514f63ab3c991fa9941cf5f01935cd79e7f6718b7abbe783d4107` | True |
