# GX01 reference SDK and empty public sandbox

This is a public synthetic integration fixture. It has no real value, external game or commercial rate. This stage completes the reference owner/author clients and the host lifecycle; image acceptance, process-kill boundaries and issuer epoch restore remain separate gates.

`ReferenceOwnerClient` retains exact original requests before sending through the real pinned v3 TLS owner endpoint. Each game has its own existing GX00 client journal; the additional exchange journal namespaces role, authority, device, game, operation and key. Identical external keys in Game A/B are independent. `retry` never creates a new purchase ID. `import_legacy_connection_client` explicitly copies original requests/receipts/bindings into this namespace, retaining source state; the old narrow client and its global `(operation,key)` constraint remain supported. `ReferenceAuthorClient` uses a separate quote/status-only credential and journal. It cannot approve, credit Wallet or use owner/ATM capabilities.

The device facade shares the existing remote Wallet contract and cache. It adds a dedicated private Game journal beneath `/data/wallet/game-client`; it does not create another cash ledger. Its health response and Hub service initialization do not require a running Game authority. Fresh TLS status determines connected state. A new UI begin click after restart recovers the persisted original connection intent, including an expired or revoked state requiring explicit attention.

## Public fixture lifecycle

Host-only CLI: `systems/rock-star-os/os/game_exchange/sandbox.py`. Copy the exact committed `fixtures/sandbox-20260910.json` into the owned mode0700 directory `/var/tmp/rockstaros-preview-authority/sandbox.json`, mode0600. Run `prepare --config FILE`, then `start`, `status`, `stop` or `snapshot` with the same `--config FILE`. These commands validate canonical paths, private files, process PID/start identity and actual lifetime locks. There is no port search or unrelated-process termination. The Linux servers bind loopback9641/9642/9643; the QEMU guest uses10.0.2.2 through user NAT. No Mac host forwarding is needed.

Initial state contains a public contract handoff and issuer metadata, with AVAILABLE0, no account registration, authenticator enrollment, terms or monthly consent. Preparation performs one no-due existing scheduler tick to initialize its UTC period guard. Users explicitly register/enroll/accept terms through the existing Wallet flow. Only then can the public fixture owner request `{v:1,op:'game.sandbox.credit',key,amount_minor:10000}` once per owner contract. This fixed test credit reuses existing idempotent simulated sale/settlement keys. Repeated clicks recover the original receipt. It is unavailable through the author SDK and ordinary remote Wallet client. Catalog includes `fixture_credit_applied`; UI labels it as test funds.

`snapshot` refuses a running sandbox and holds the actual C, router, Wallet and all Game locks. It reads all five DBs, unknown SQLite tables/rows/schema and retained JSON identities without constructing services or recovering journals. Financial/authentication/account tables are initially empty. It is an observation command, not a backup/restore claim. Current-copy restore support is a subsequent gated implementation; device-only exports cannot recover these external authorities.

## Image derivation

`game_exchange/profile.py prepare --base DIR --images NEW_DIR --expected SHA_JSON --source-commit HASH` requires a source-checked unconfigured base. It retains the kernel and all stage0 members except the existing signed factory descriptor, injects the public Wallet configuration and credential, verifies embedded client bytes and rejects host authority/signing modules in the guest. Output `profile.json` records base/final triples, source hashes, exact injected files and factory envelope hashes. A new signed profile is not yet evidence of a successful boot. `device-config --images DIR` emits explicit `rock-desktop-device/7`, network `game-authority`, profile `development-game-authority`. Existing older device schemas retain their validation and migration behavior.

Validation: actual Linux TLS SDK/facade/core/migration16tests PASS11.388s, skip0. Independent A lifecycle probe started and stopped the real sandbox, rejected a running snapshot, and compared5DB/71tables/8JSON identities exactly; all19 required empty financial/credential/member tables stayed0. No QEMU or OS-image PASS is claimed by this stage.

追加端末では `sdk.recover_connection(game_id, connection_id)` を使う。
これは `/v3/wallet` の厳密な `game.exchange.connection` 読み取りを通じて、
現在の owner/account/device と、元の接続 intent/consent、現在の署名済み接続状態を取得する。
返却 schema は `rock-game-exchange-connection/1`、fields は
`owner,intent,consent,shared,as_of,simulation_only`。
同じ owner/account の端末に限って元の intent/consent bytes を private journal へ保持する。
接続時の challenge を別端末へ移さず、購入には追加端末自身の新しい approval intent と本人署名を要求する。
別 owner への取得、失効した transport からの履歴取得、失効した作者からの元 quote 再送は拒否する。

作者 SDK の v2 namespace は role/transport/Game/connection/operation/key を含む。
旧 v1 namespace の元 request/receipt は、同じ connection への完全再送の場合だけ
その行を変更せず読み通す。別 connection の同 key は v2 行に分かれ、
`retry(key, connection_id=...)` で元要求を特定する。複数 connection が同 key を
持つ場合、connection_id のない曖昧な retry は拒否する。
Alice/Bob の Wallet authority は別 UUID のため、一作者 SDK が両方を扱う場合は
既存の `wallet_authority_id` に加えて
`additional_wallet_authority_ids=(bob_wallet_uuid,)` を初期設定時に明示する。
信頼する UUID 集合は private journal の identity に固定し、再起動時の変更と
未登録 UUID の応答を拒否する。既存単一 Wallet 構成の identity bytes は保つ。

Runnable examples と実行手順は
`systems/rock-star-os/examples/game/README.md`。別々の owner/author 公開設定を使い、
診断は未確定要求の元 operation/key を表示する。6 purpose の実 TLS golden vectors
は `os/game_exchange/fixtures/exchange-v1`、独立 Node の canonical/署名検査は
`node examples/game/verify-golden.mjs`。これは JavaScript 全機能 SDK の提供という主張ではない。
