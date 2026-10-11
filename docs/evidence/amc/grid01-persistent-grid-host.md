# GRID01 persistent grid host evidence

Date: 2026-10-11
Environment: Linux cloud container running as root, Node test runner, Miniflare D1 with the repository migrations, local `javac --release 11`. No Android device, no emulator, no deployed Worker, no production database, no real money.

## Scope accepted

- Persistent grid on the server side: `lib/sky-compute-grid-store.ts`, `lib/sky-compute-grid-live.ts`, `lib/sky-compute-grid-api.ts`, `lib/sky-compute-grid-crypto.ts`, migration `drizzle/0063_sky_compute_grid.sql` and the five routes under `app/api/sky/compute-grid/`.
- Off by default. `SKY_COMPUTE_GRID_MODE` must be `owner_pool` or `owner_and_public_pool`, and `SKY_COMPUTE_GRID_DATA_KEY` must be set, before any order or device request is accepted.
- Device requests are accepted only when signed by an enrolled, attested A2A Broker key of the signed-in owner. Forged, replayed, stale and revoked-device requests are refused.
- One active lease per device, one receipt per lease, expired leases reassigned, attempts bounded, budget never exceeded, one ledger entry per verified assignment. These hold as database constraints and triggers, not only as application checks.
- Verification by owner trust (owner pool only), server reference computation, or duplicate quorum across distinct devices (owner pool) or distinct accounts (public pool). Float SKUs compare by cosine similarity, integer SKUs by exact bytes.
- Lot inputs and outputs are stored as AES-256-GCM ciphertext bound to owner, order, lot, assignment and digest. Closed orders are purged on request or after the retention window.
- First dispatchable SKU `text-lexical-embedding-v1`: TypeScript reference, Java port `android/core/src/main/java/dev/rock/core/ComputeGridLexicalEmbedding.java`, and shared vectors `contracts/sky-compute-grid-lexical-embedding-vectors.json`.
- Holes found in the PR #98 host fixture and closed in `lib/sky-compute-grid.ts`: the provider was not bound to the lease, a duplicate quorum could be met by one provider, unreviewed artifact digests were accepted, and the internal provider reference travelled in the verification evidence.

## Commands and observed results

```text
node --experimental-strip-types --test tests/sky-compute-grid.test.mjs
12 passed, 0 failed

node --experimental-strip-types --test tests/sky-compute-grid-skus.test.mjs
8 passed, 0 failed (includes an independent BigInt implementation and a drift guard on the Android copy of the vectors)

node --experimental-strip-types --test tests/sky-compute-grid-store.test.mjs
30 passed, 0 failed (Miniflare D1, migrations 0048 and 0063 applied as written)

node --experimental-strip-types --test tests/sky-compute-grid-api.test.mjs
4 passed, 0 failed

node --experimental-strip-types --test tests/database-status.test.mjs tests/migration-union.test.mjs tests/product-baseline.test.mjs
passed together with the four suites above: 67 tests, 0 failed

javac --release 11 -d <scratch>/classes $(find android/core/src/main/java -name "*.java")
exit 0

node --experimental-strip-types scripts/check-os-parity.mjs <scratch>/classes
OS tool parity: 36 checks passed
Compute Grid SKU parity: 46 lots identical (Java ↔ TypeScript reference)
```

Mutation checks run during development, each restored afterwards: removing the quorum size check, the lease ownership check, the one-receipt-per-lease constraint, the budget affordability check, and the Java rounding step each made at least one test fail.

## Repository-wide verification

```text
npm run verify
private, project, repository, version, schema, database, release, release signing, baseline, avocado R5, design,
system composition, LLM architecture, CSV, Sky, Sky launch, Android architecture, device support, first flash,
shared, typecheck and product lint passed. `npm test` then reported 1765 tests: 1758 passed, 1 skipped, 6 failed,
and the aggregate run stopped there.

the 6 failures
tests/mcp-connector.test.mjs (2), tests/mcp.test.mjs (3), tests/mr-pc-adapter.test.mjs (1). All six refuse to run
because this container runs as root ("PC citations requires a normal macOS or Linux user"). The same six failed in
this container before this work started, on the base the branch was first built on. The three test files are
byte-identical between main 4055ad38 and this branch, and the code they test is not changed by this branch.

the same three suites as a non-root user (runuser -u nobody)
38 tests: 37 passed, 1 failed. The six root-only tests passed. One other test, which starts the bundled
fashion-brand-ops MCP server as a child process, failed for that account; it passes as root in the run above.

stages after `npm test`, run one by one
fashion:package:check, mcp:package:check, billing:check, operator-dock:check, test:fashion-brand-ops,
test:avocado-mini-site (after `npm --prefix sites/avocado-mini ci`), test:public-preview, build,
release:web-bundle:check, release:web-assets:check, test:api, mission:check, work:check, bot:check: all exit 0.
```

The repository-wide run is therefore recorded as **blocked by the container's root user in six unrelated tests**, not as passed. GitHub CI on the pushed commit is the result to rely on for those six and for the Android JUnit and Gradle jobs.

## GitHub CI

Commit `ca76306c0b8596e6c3ced24482b12a357ce32ae2` on branch `claude/sky-compute-grid-live`, pull request #103.

| Check | Result |
| --- | --- |
| `verify` | success. This includes the six tests the work container could not run as root |
| `prototype` (Android) | success. The step `gradle -p android :core:test …` ran the JUnit test of the Java SKU for the first time, and the step `check-os-parity.mjs` compared Java with TypeScript |
| `CodeQL`, `SPIDER CodeQL (javascript-typescript)`, `SPIDER CodeQL (python)` | success |
| `SPIDER / repair regressions`, `SPIDER / production web security measurement` | success |
| `SPIDER / secrets` | **failure**: three `generic-api-key` candidates, all the same value |

The value the secret scanner reports is `0148e10d32030fbaee7eedf967db70a3b7665da854faeb0f87ecd8e3659381a5`, under the key `tokenizerSha256`, in:

- `lib/sky-compute-grid-skus.ts` line 64 (commit `0cf0895f`)
- `contracts/sky-compute-grid-lexical-embedding-vectors.json` line 8 (commit `0cf0895f`)
- `android/core/src/test/resources/sky-compute-grid-lexical-embedding-vectors.json` line 8 (commit `934cc8db`)

It is not a credential. It is the SHA-256 of the public specification text `LEXICAL_EMBEDDING_TOKENIZER_SPEC` in `lib/sky-compute-grid-skus.ts`, and can be recomputed:

```text
printf 'sky-compute-tokenizer/utf8-bytes/1\nnormalization=none\nlone-surrogates=rejected-before-dispatch\n' | sha256sum
0148e10d32030fbaee7eedf967db70a3b7665da854faeb0f87ecd8e3659381a5
```

The scanner matches it because the key name contains "token". The fourth annotation on that check (`hidden.txt`) is the scanner's own self-test and also appears on main.

This branch does **not** add a scanner exception and does not move the pinned policy commit. `SECURITY.md` and `docs/spider-guard.md` put exceptions and the pinned control commit under owner review, and a pull request should not change the policy that judges it. The check stays red until the owner, or whoever maintains SPIDER for the owner, registers the reviewed exception (rule `generic-api-key`, the three exact paths above, the exact value above, classification `public-artifact-digest`, with the same-file detection test `SECURITY.md` requires) and pins the new control commit.

## Not accepted

- Android worker: designed in `docs/sky-compute-grid-android-worker.md`, not implemented. No APK contains it.
- The JUnit test `ComputeGridLexicalEmbeddingTest` was not run here because Gradle cannot download its plugins in this container. It runs in the GitHub CI `:core:test` job. The Java port itself was compiled and compared through `check-os-parity`.
- No emulator run, no Pixel run, no multi-device run. Acceptance ids W1–W10 in the worker design are all open.
- Migration 0063 has not been applied to any deployed database. The grid has not been enabled in any deployment.
- Public pool, real buyer demand, credit use, cash payout, Wallet connection, billing, tax and legal acceptance, thermal and battery measurements, and a 50-device pilot were not run.
- Semantic embedding (a model on the device) is not part of this evidence. The dispatchable SKU is a lexical hash embedding.
