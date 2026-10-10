# GRID01 host fixture evidence

Date: 2026-10-10
Environment: local host, synthetic JSON fixture, no Android device, no external network, no real money

## Scope accepted

- Closed `CapacityOffer`, `ComputeOrder`, `ComputeLease`, and `ComputeReceipt` contracts.
- Android arm64 supply only; fixed `public-text-embedding-v1` artifacts.
- Charging, idle, unmetered-network, thermal, region, trust, memory, input-size, price, budget, and time-window matching gates.
- Deterministic finite lease allocation without exposing the internal provider reference to the buyer lease.
- Independent-reference and distinct-lease duplicate-quorum verification.
- Rejection of personal data, arbitrary SKU/code, silent cloud fallback, unsafe device state, artifact mismatch, incomplete results, and unverified settlement.
- Idempotent `service_credit_hold` preview with live payout and Wallet mutation disabled.

## Commands and observed results

```text
node --experimental-strip-types --test tests/sky-compute-grid.test.mjs
6 passed, 0 failed

npm run baseline:check
passed; RQ01-RQ50 and Sky Compute Grid fail-closed boundaries checked

npm run design:check
passed; Sky Compute Grid design indexed in the Sky/Zema/tools domain

npm run build
passed; `/sky/compute-grid` and `/api/sky/compute-grid/demo` are present in the route manifest

npm run verify
the aggregate run passed project, repository, version, schema, database, release, baseline, design, Sky, Android, shared, typecheck, and lint gates, then stopped in the unchanged PC-citations suites because this macOS Python runtime does not expose `os.waitid`. `tests/mcp-connector.test.mjs`, `tests/mcp.test.mjs`, and `tests/mr-pc-adapter.test.mjs` rejected the host as unsupported. No PC-citations source or test file is changed by GRID01. The feature suites and `npm run build` passed separately.

verify tail after the stopped aggregate run
fashion and MCP package checks, billing and Operator Dock dry-runs, Fashion Brand Ops, Avocado Mini, public preview, meme-intelligence, Avocado Farm, web bundle/assets, Work API/CSV, and mission checks passed when run individually; socket-based suites were rerun outside the filesystem/network sandbox

local dev HTTP readback
GET `/api/sky/compute-grid/demo` = 200; matched 1 lease / 2 lots / 6,400 micro test credits; verified; live payout false
GET `/sky/compute-grid` = 200; rendered the host-fixture boundary, match, rejection, verification, and settlement-hold states
```

## Not accepted

Android worker/APK, WorkManager or JobScheduler wiring, device attestation, emulator, Pixel hardware, multi-device network, production storage, real buyer demand, real provider earnings, live billing/payout, tax/legal acceptance, thermal/power/lifetime measurements, and a 50-device pilot were not run. The UI and API show a synthetic host fixture only.

The repository-wide `npm run verify` result is therefore recorded as host-blocked rather than passed. The directly affected GRID01 suites and build passed; this evidence does not treat the unrelated PC-citations failure as proof of GRID01 correctness.
