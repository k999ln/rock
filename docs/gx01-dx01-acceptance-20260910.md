# GX01 / DX01 synthetic acceptance matrix

This matrix covers the scoped host contract and the reference SDK. It is not a
final OS-image or release verdict. The final image/UI, D0–D6, installer and fresh
SDK environment each retain their own source/config/image hashes and reports.
All rates, funds, keys, owner credentials, players and assets here are public
synthetic fixtures. No reverse exchange, real funds or external game is enabled.

The contract uses the existing owner Wallet for cash and two independent Game
SQLite authorities for purchased units. A 100-cent principal plus a 3-cent test
fee reserves103cents and grants10 units only once. EARNED/BONUS units are not
spendable cash. New account/auth/terms/monthly-consent/balance rows are empty at
sandbox preparation; the owner explicitly registers and credits test funds.

| Requirement | Actual implementation and evidence | Result scope |
|---|---|---|
| GX00 game namespace and exact old receipts | `test_game_connections_tls`: same-key A/B reconcile; literal old namespace read-through; altered same-game body rejected | Host real TLS |
| Two owner contracts, A1/A2 and B1, month888 and ATM isolation | `test_wallet_managed_tls`: required two-owner monthly, insufficient-owner typed snapshot, foreign ATM cancel/receipt, same worker A1→B exception→A2 | Host real TLS/C/OwnerRouter |
| Nonempty existing ledger migration | `test_game_exchange_migration`; actual old CLAIMED month, ATM hold, pending sale, revoked auth/counters, BLOBs/receipts/schema/rowids/SQLite sequence retained | Explicit stopped migration |
| Strict amounts and separate signature domains | `test_game_exchange_golden`; literal quote/approval/apply/status/reject/terminal from actual TLS; Node `verify-golden.mjs` exact canonical bytes/SHA256/Ed25519 and other-domain rejection | Python + independent Node |
| Atomic owner approval | `test_game_exchange_tls`: dedicated assertion, counter, attempt, hold/outbox and permanent signed insufficient denial; changed payload/key cannot authorize again | Same Wallet transaction |
| Human review delay and quote expiry | `test_game_reference_sdk`: 3-second review leaves117000ms; dedicated Game ceremony accepted while ATM rejects it. `test_game_exchange_races`: signed expired denial is permanent, explicit new version can proceed | Actual owner signatures |
| Two Game journals and terminal receipts | `test_game_exchange_tls`: independent A/B TLS/DB/asset journals, exact final receipts and amount conservation | 2 real loopback Game servers |
| One SDK for two games/authors/owners/players/devices | `test_game_reference_sdk`: Alice A1/A2 and Bob B1 use the same owner SDK; two author SDKs use separate credentials; one author SDK can explicitly pin both Wallet UUIDs | Same implementation, multiple actual clients |
| Same key on multiple player connections | Author v2 includes connection identity. Literal v1 row is read through exactly; another owner/player uses the same key in a separate row. Retry without connection is rejected if ambiguous | Original legacy row/receipt unchanged |
| Additional device and scope | `recover_connection` learns current authenticated owner/account/A2 and original A1 consent. A2 cannot use A1 challenge; its purchase uses a new A2 challenge. Bob cannot recover Alice connection | Fresh owner TLS; no moved assertion |
| Current revocation and first claim | `test_game_exchange_races`: connection, owner transport, owner assertion credential and author revoked before first claim produce permanent signed reject; backward clock preserves hold; expired connection cannot start apply | C→author gate→Wallet transaction |
| Revocation after dispatch may already be in flight | Durable claim followed by revocation retains original apply/receipt; terminal can complete once | No inferred rollback |
| Shared AVAILABLE race | Barrier starts ATM3000, monthly888 and A/B principal2000 against AVAILABLE5000 plus pending200. Accepted amounts plus remainder=5000, month once, pending200 untouched, other owner full typed snapshot unchanged | Real TLS plus existing managed billing tick |
| Cancellation versus late apply | Two actual TLS connections race apply and conditional reject against Game SQL transaction; exactly one permanent terminal, same receipt on both responses, no grant plus cash release | Actual Game commit race |
| Missing/invalid/foreign terminal | `test_game_exchange_tls`: NOT_FOUND and tampered or foreign receipt retain hold; signed rejection prevents later apply; exact signed terminal recovers commit-lost reply | No mocked success receipt |
| A stall does not block B/ATM | `test_game_exchange_deadlines`: A actual TLS response stalled, B exchange and ATM issue/cancel finish within2s while A waits; existing3s transport budget holds | Actual deadline and financial observations |
| A disconnect/truncation/oversize after real Game commit | Actual GameHandler sends no reply, truncated reply or65537-byte response after Game commit; Wallet hold stays, B finishes, fresh status recovers the exact original terminal with no second grant | Real TLS faults |
| Process interruption | `test_game_exchange_process_kill`: 11 actual SIGKILL boundaries around migration, approval, claim, Game commit, Wallet commit and current-copy epochs/receipt; new process reconstructs C/router/TLS/SDK | SIGKILL is distinct from exception tests |
| Current-copy across external authorities | `test_game_exchange_restore` and `test_game_sandbox_backup`: exact stopped current source, retained C/router/index/A/B, source RETIRED, new epoch, each Game issuer receipt, old apply refusal, unknown holds preserved, same-intent interrupted recovery | Same host, current state only |
| No duplicate writer or unrelated target adoption | Lifecycle process identity/locks, unfinished local restore gate, aggregate desktop PENDING gate, cumulative retired devices, changed source/target/archive/unknown DB rejection | Actual managed gates and negative tests |
| Narrow old client and explicit SDK import | Existing GX00 `(operation,key)` client remains supported; `import_legacy_connection_client` preserves original request/receipt bytes and source snapshot, with explicit import and exact retry | No silent original-ID rewrite |
| Runnable sample and diagnosis | `examples/game/owner.py`, separate `author.py`, pinned public JSON and README; actual 2-Game sample API test with restart/setup/approval exact retry | Internal TLS sample test |
| Fresh environment and DX timing | `examples/game/acceptance.py` requires empty stopped sandbox, runs separate CLI processes and records all outputs/hashes, setting inputs and code lines; B runs it in a dedicated new Lima | PASS_INTERNAL_SYNTHETIC aee3d61; separate new Lima, initial0→2 exchanges, offline diagnose/retry and independently stopped5DB/71tables match |
| Native UI and signed OS | Root uses actual Platform UID1002, Wallet1003 and dedicated authenticator1004; final image installation/source binding and D4/D5/D6 are A/B/root gates | Not substituted by host tests |

## Persistence and normal read clocks

Preserved business data includes exact original requests, consent, quote,
approval, signatures, receipts, postings, outbox bytes, row identities, schema,
unknown tables and all other owners' data. Some normal reads advance only a
specific anti-rollback or receipt-freshness clock:

- Guest connection A/B: `identity.maximum_time` and `bindings.as_of`, both INTEGER
  and nondecreasing; `as_of <= maximum_time`. Same identity/UUID/path/configuration,
  binding intent/consent/shared/generation, all other rows/schema remain exact.
- Guest exchange journal: `identity.maximum_time` is INTEGER and nondecreasing;
  all requests/quotes/intents/proofs/migration receipts remain exact.
- External connection index: `identity.maximum_time` is INTEGER and
  nondecreasing when an explicit Game status/list/reconcile is read; all other
  identity cells and all other tables/schema/JSON remain exact.

These are column-specific observations for a nonempty Game-history read cycle,
not permission to ignore a row/table or reset a clock. D6 starts without Game
connections or Game actions and still requires its complete external snapshots
to remain identical. Current-copy completion replay is stricter: any subsequent
current-state change, including a legitimate read-clock advance, invalidates the
old current-copy receipt as a new restore authorization. Take a new stopped
backup after the latest activity.

## Report interpretation

The onboarding fixture counts two configuration inputs **per role**: the pinned
public JSON and the private client-state path. Game/connection/exchange IDs and
explicit consent are operation inputs. The report also records whole provided
example nonblank, noncomment lines; these include CLI/bootstrap/diagnostics and
are not a claim about irreducible integration effort. First-exchange, cause
identification and recovery durations are machine elapsed time in an internal
fixture. They do not measure a person's setup time or external author feedback.
An offline quote failure in that sample does not prove the server committed it;
actual post-commit lost responses and SIGKILL have the separate tests above.

The committed host report retains compact per-boundary process exits, financial
and credential-counter values, request/receipt hashes and old/new writer epochs.
Full subprocess outputs, SQLite snapshots and duplicate test logs remain outside
Git at the absolute paths and SHA256 values recorded in that report.

## Fresh SDK result

The independent fresh Lima run of `aee3d61` completed the internal SDK gate.
[The installer report](evidence/rls01/sdk-fresh-aee3d61/summary.json) records two
configuration inputs per role, owner110 and author38 nonblank/noncomment lines,
first exchange7.196284s, diagnosis0.239930s and original-request recovery2.220017s.
These times start inside the already provisioned VM; they exclude environment
download and installation. The complete CLI harness took11.700720s.

Stopped observations independently matched the entire final5DB/71-table snapshot:
AVAILABLE9794, purchases200, fees6, holds0, monthly bills0; GameA/B each have one
10-unit grant at epoch1. Source-file bytes and the original/independent-report
SHA256 values were checked before recording this result. The earlier `9cfe6e7`
fresh run remains FAIL_RETAINED: its sample diagnosed a stale cached snapshot as
verified TLS. `aee3d61` requires fresh backend connectivity and passes an actual
TLS-stop regression. The corrected full trial used another new VM and client
state. This result does not replace final OS-image, installer or D0–D6 acceptance.
