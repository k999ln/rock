> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# MCP broker: 接続解除と同意の永続境界

2026-09-09更新。`os/mcp_broker/` に購入資格adapter、HTTPS gateway、端末clientを追加し、OS Platformとnative画面へ結合した。[最新の検証範囲](MCP-HUB-INTEGRATION.md)を参照。以下の独立module試験は当初の証拠であり、新OS起動の代用にはしない。公開MCPサービス、実決済、実BlackBerryは未検証。新しい署名鍵は作成していない。

## 実装した範囲

接続は認証済み `Principal(subject, device_ref)` と alias に所属する。接続/解除のたびに SQLite の epoch を進める。解除と送信 claim は同じ Broker lock/transaction で順序を確定し、解除より前に claim が無い仕事を取り消して入力を削除する。claim 済みなら送信撤回済みとは扱わず、元の provider receipt の照合だけを行う。

各仕事の immutable plan は、端末・主体・epoch・Tool・入出力 schema・固定 route descriptor・data scope・価格版/通貨/金額・選択 UTF-8 入力の SHA256・有効期限・business key を含む。`submit` は exact digest と明示 `approved: true` を要求する。preview を取得しただけでは実行されない。期限は120秒で、新規受付では時計巻戻りを拒否する。

送信 claim の commit 後は、元の入力を再送する処理を設けていない。HTTP の新しい JSON-RPC ID は元の business key を変更しない。応答喪失、再起動、worker 終了、送信 claim の commit 後に起きる例外は `unknown` として回復する。provider に `not_found` と言われても元の効果を自動実行し直さない。完了 commit 後に例外が返っても terminal の receipt を `unknown` へ戻さない。

価格/schema が変わる再接続後は古い未送信 plan を使用できない。元の route object は回復専用として保持し、再起動時は必要なら `recovery_routes` に明示設定する。これは `status_tool` の呼出しにだけ使い、旧 token/grant による新実行を復活させない。元の pinned route または現在の回復資格が無い場合は unknown を保持する。上流 OAuth token 失効 API は未実装であり、`disconnect` receipt に `upstream_credential_revocation: NOT_IMPLEMENTED` を返す。

## 認証と API

`Broker(state_dir, *, routes, recovery_routes=(), principal_adapter=None, clock=...)`。

`principal_adapter=None` は全て拒否する。組込先は `authenticate(opaque_auth)->Principal` と `guard(principal, action)` context manager を提供しなければならない。guard は拒否時に `PermissionError` を送出し、許可されるローカル受付の間は現在資格の更新と競合しない lock を保持する。全 read、同キー replay、worker の start/recover も現在資格を検査する。opaque auth/token は SQLite に保存しない。action は `connect/disconnect/prepare/submit/start/recover`。

lock 順序は **資格 authority の guard → Broker RLock → SQLite**。通信はこの外側で行い、connect の discovery 後も guard を取り直す。既存 EntitlementStore と統合する場合は、その同じ instance の guard をアダプタに使う。別の読取 DB snapshot を認可 grant として渡す構成は不可。現在の試験用 adapter は既知の public fixture principal だけを扱う。route ごとの企業 policy、複数上流アカウント、OAuth の現在資格確認は統合先で明示設計が必要である。

| API | 意味 |
|---|---|
| `connect(alias, route_id, key=..., auth=...)` | discovery 成功後に新 epoch を確定。元の control key の replay は元の履歴 receipt を返し、旧接続を復活させない |
| `connection_status(alias, auth=...)` | 現在の state/epoch。connect/disconnect receipt は履歴なので、UI はこの現在状態と混同しない |
| `disconnect(alias, key=..., auth=...)` | 新規 admission を停止。既送信の結果・資金の巻戻しは意味しない |
| `prepare(alias, tool, text, key=..., auth=..., data_scope=...)` | 入力・条件を固定して preview を返す。送信しない |
| `submit(key, consent, auth=...)` | exact plan の同意を受理して永続 queue へ。返値は local acceptance で、遠隔実行成功ではない |
| `status(key, auth=...)` / `history(auth=...)` | 所有する状態/receipt の読取り。history は最大50件、raw output は含めない |
| `reconcile(key, auth=...)` | 既送信の照合を促す。新しい効果を実行する許可にはしない |
| `process_one()` / `start()` / `close()` | 独立 worker の制御。dead worker を再開し、active request が残る close は lock を保持してエラーを返す |

control key と business key は別の名前空間。各名前空間では同じ主体/端末/key に異なる内容を使えない。新 key は新しい明示 intent を意味するため、上位 UI が不明応答を理由に勝手に作り直してはならない。

## MCP wire の正確な範囲

公式 [2026-07-28 schema](https://modelcontextprotocol.io/specification/2026-07-28/schema) と [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) に基づく、POST `/mcp` の **`server/discover` と `tools/call`、JSON complete response** を実装した。要求ごとの version/client capabilities、`MCP-Protocol-Version`、`Mcp-Method`、`Mcp-Name` を送る。response ID/version/capabilities、Content-Length、body size、provider receipt の key/digest/shape を確認する。

`MCPHttpClient` は trusted configuration にある literal IP の固定 origin と `/mcp` だけを使用する。HTTPS は明示 CA と `upstream_principal` binding が必要。実試験は public credential を使う `127.0.0.1` の明示 HTTP fixture 例外である。HTTPS constructor があることを、実 TLS 相互運用済みという意味にしない。DNS discovery、任意 URL/path、redirect、旧 protocol fallback、OAuth discovery/refresh/revoke、stdio、SSE受信、notifications、Tasks、MRTR、Apps、tools/list は未対応。未対応 response は成功扱いせず照合状態を保持する。

`ToolPolicy` の最小入力は `{"text": "選択した文字列"}`、output は `{"text": "結果"}` に限定する。ファイル選択、任意 shell、任意 Python、一般 workflow graph、local redaction の実装ではない。data scope は固定の許可値と照合する。Tool/schema/価格は運営が設定した allowlist であり、remote の説明文から自己承認しない。

`dev.rockstaros/intent` metadata と `rock-mcp-effect-receipt/1` は **MCP 標準ではない明示 provider 契約**。effect Tool は business key と consent digest を原子的に記録し、別の status Tool が同じ receipt を返す必要がある。fixture の `text.upper` は実際に text を変換し、SQLite に結果を一度だけ記録する。`effect.status` は読み取り専用。一般 MCP server にこの契約があるとは想定しない。独立 SDK との適合認証ではなく、公式 envelope を実装した所有 fixture との実 HTTP 相互運用である。

`settlement_correlation` は照合用 opaque ID だけである。Tool の成功、金額 metadata、correlation から Wallet を変更しない。現行月額 USD8.88 の追加徴収でもない。実売上、開発者の royalty、送金、返金、provider event 検証は未接続。

## 境界と検証

入力は最大64 KiB UTF-8、response は最大128 KiB、plan は32 KiB。timeout は0.05〜10秒、既定2秒。JSON-only の Content-Length response を読み、期限・サイズ・redirect・ID 不一致を拒否する。identifier、Tool/route数、operation/control receipt数、logical payloadの容量を制限する。SQLite の filesystem 全体に対する hard quota ではない。

private directory 0700、DB/lock 0600、regular/owner/nlink 検査、単一 process の flock を使う。既存 DB の必須 table 欠損は自動修復しない。送信前の input は再開のため保持し、claim/取消後は column を NULL にする。SQLite 古い page/journal の暗号化や物理的な安全消去は実装していない。receipt/history は保持され、容量超過は明示エラーになる。

実試験は `tests/test_mcp_broker_core.py`。所有 HTTP server と実 SQLite を使用し、正常処理、認証失効、同意/schema/価格変更、解除の前後競合、半分の応答喪失、同キー回復、元 route 不在、worker 停止、commit 前後の例外、入力削除、DB欠損、capacity、timeout を確認する。結果は `os/mcp_broker/evidence/` に source hashes と実ログを記録する。OS/VM boot、native 操作、外部 MCP、実精算はこの試験の対象ではない。

再実行: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src:os python3 -B -m unittest discover -s tests -p 'test_mcp_broker*.py' -v`。通常 sandbox が localhost bind を拒否する環境では、所有 loopback fixture だけを許可した実行が必要になる。試験は外部 network、実資金、新鍵を使用しない。
