# Game SDK read-clock retention — 2026-09-10

Requirement/principle/inconvenience/reuse/minimal change/measure/evidence: D5 and D6 preserve every completed result, consent and financial receipt; a fresh read must not be mistaken for changed business data; reuse the closed SQLite observer; project only three SDK identity clocks and the two connection observation clocks; require exact typed non-clock cells and monotonic bounded INTEGER clocks; 14 focused real-SQLite cases plus 79 existing Linux regression cases pass. This is an observer contract, not an acceptance result for a new OS run.

The intermediate 4e31554 Game UI run remains **FAIL** for its original retention assertion. Its old snapshots contain complete row hashes but lack the typed clock projections needed by this policy. The new observer cannot retroactively accept that run. A fresh fixed plan must collect both observations before it can establish retention.

`development-game-authority/1` now binds the exact `game_cache_retention.py` bytes in its saved retention profile. The only permitted differences are:

| Guest database role | Column | Required constraints |
| --- | --- | --- |
| `game_exchange_cache`, `game_connection_a`, `game_connection_b` | `identity.maximum_time` | Exactly one identity singleton; SQLite INTEGER; 0–9007199254740991; nondecreasing at every compared observation |
| `game_connection_a`, `game_connection_b` | `bindings.as_of` | SQLite INTEGER; same bounds; each existing binding nondecreasing; never greater than its database identity clock |

Every other typed cell in these rows, including intrinsic rowid, UUID, path, configuration, intent, consent, generation and shared receipt, contributes to a stable projection hash. Exact column lists reject added or missing columns in either projected table. Every row identity and count must match. All schemas, sequences, additional tables and other journal row hashes remain exact, including owner, requests, quotes, intents, player proofs and migrations. The exchange journal does not receive a bindings exception. External Wallet and Game authority observations retain complete canonical equality with no clock exception.

`business_snapshot` collects the projections only for the explicit profile, verifies the policy and helper SHA before observation, and includes them in the same stopped database transaction. `compare_business` and `unchanged_non_hub` require the projections and permit only the specified integer changes. Profiles without this policy retain their previous full-row comparison.

Validation on actual Debian ARM64 Linux, Python with ResourceWarning as error: `/var/tmp/rock-game-clock-tests-20260910/tests.log`, 93 tests, zero failures/skips. The 14 new cases cover all three roles, empty bindings, clock rollback, future observations, unknown columns, invalid types/bounds, every identity field, generation and receipts, intrinsic rowid, BLOB-versus-TEXT differences, every remaining journal and an unknown table, insertion/deletion/rebinding, missing projections, schema/sequence changes and explicit-profile enforcement. The same 14 focused cases also passed on macOS. No guest runtime was modified, no financial mutation was requested, and no D5/D6 guest acceptance is claimed by these tests.
