# Explicit Game UI read retention

RQ-12/RQ-16/RQ-17: UI read must not debit or erase records; reuse sandbox lifetime fences and complete typed SQLite snapshots; permit only the necessary anti-rollback INTEGER clock; require every other cell/schema/sequence/retained JSON unchanged.

`os/desktop/game_authority_ui_retention.py` is a separate, explicitly selected observer. It does not change `game_authority_observer.unchanged`, the initial empty baseline, or D6. Select the policy in the acceptance plan **before** obtaining both observations:

```sh
python3 os/desktop/game_authority_ui_retention.py capture \
  --policy index-identity-maximum-time-only/1 \
  --config /var/tmp/rockstaros-preview-authority/sandbox.json > before.json
# Start the owned sandbox and OS; read retained Wallet/Game UI; normally stop both.
python3 os/desktop/game_authority_ui_retention.py capture \
  --policy index-identity-maximum-time-only/1 \
  --config /var/tmp/rockstaros-preview-authority/sandbox.json > after.json
chmod 600 before.json after.json
python3 os/desktop/game_authority_ui_retention.py compare \
  --policy index-identity-maximum-time-only/1 --before before.json --after after.json
```

Use a private evidence directory and `umask 077`. Capture holds the existing control, sandbox, coordinator, router, all retained Wallet, index and both Game locks. It opens the index SQLite database with `mode=ro&immutable=1` and `query_only`, and takes another complete snapshot under the same fences to detect observer side effects. No authority service is started by capture.

The full table digest is retained. A separate typed singleton row must reproduce its exact digest before comparison can project only `game-index/game.sqlite3.identity.maximum_time`. It must remain a nonnegative SQLite INTEGER and never decrease. Intrinsic rowid, singleton, UUID, path, configuration, exact columns, unknown rows/tables/databases, schema objects, sequences and protected identity JSON remain bound. Other Game/Wallet clocks are not exceptions. The policy permits no change caused by a new transaction or current-copy restoration; take the baseline after restoration has fully completed, then compare the read-only UI cycle.

Mac unit tests: 10 tests with mutation subcases cover actual SQLite read-only capture, typed digest binding including Unicode, regression/type/bounds, missing/extra rows, schema/pragmas, unknown tables, other authority rows, JSON/configuration and the unchanged default observer. Actual fresh Game intermediate `8bd2b26` capture after interrupted/current-copy recovery includes 7 databases; the subsequent UI comparison is separately recorded in installer evidence. Earlier snapshots that lack the typed row projection cannot be retroactively turned into a PASS.
