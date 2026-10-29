# Eve local model development toolkit

This is an experimental Mac training and Pixel-client test unit. It does not add a production account, an OS Tool, execution authority, a paid provider, or a native Android model. A saved adapter and low loss are not quality acceptance.

The session uses the cached `mlx-community/Qwen2.5-1.5B-Instruct-4bit` at revision `8b403126fc14f14cfc99bb4cfa72ecbc129ea677`. The weight SHA-256 is checked against `0979f33d1bc58afcf696d13f57977644e7b11a6f0eec3e631d8e9463d18c0717`. Tokenizer/config/template, data, adapter and runtime identities are recorded separately. There are no model downloads, external teacher calls, or paid API calls in these commands.

## Data and research decisions

`dataset.py` generates project-authored synthetic tasks, not scraped research text. Twelve renderer/domain families are assigned to six train, three validation and three sealed-test families before Japanese/English and clean/adversarial variants. Counts are240/120/120, with20 separate development tasks and80 sealed preservation prompts. Related templates and repeated gold answers remain; these splits do not establish independent generalization.

Tasks include two to four sources, count/duration synthesis, unit conversion, conflicting dates, missing current information, obsolete unverified notes, injection, source formatting, routing, observed argument repair, unconfirmed completion and discriminating hypotheses. C/D facts must appear in the requested answer. `prepare.mjs` records failures from the existing pure Tool validator for synthetic repair setups. No future Tool observation or private corpus is supplied to a target. This is short-answer supervised fine-tuning, not teacher-model distillation.

The research-integrated design supplies the rationale: external acceptance and artifact binding; separate memory/weight effects; observed repair rather than future-state leakage; attack resistance alongside benign utility; and content correctness separate from evidence support. The latter follows the LongChang-derived C/S distinction recorded in the design. `test_evaluate.py` has explicit correct/supported, correct/unsupported, supported/partial, incorrect and unavailable controls. These controls test the scorer and are not model results. `evaluate.py` leaves semantic judgments unavailable until independent adjudication; source markers and lexical checks alone do not set correctness or support.

## Prepare a new session

Use an existing reviewed local MLX environment. Runtime development was performed with Python3.12, MLX0.32.4 and MLX-LM0.32.2. Unit controls need Python3 and a Node version supporting TypeScript stripping and `node:sqlite` (the repository runtime). Keep run data, SQLite, weights, credentials, captures and full logs outside Git.

Create `session.json` in the external run directory with a fresh UTC `startedAt`/`deadlineAt`, `startedMonotonicSeconds`/`deadlineMonotonicSeconds`, and the complete300-minute objective. Never reset the clock or budget ledger to obtain more calls. The previous research and previous smoke do not count as this session.

```sh
python3 toolkits/eve-model/dataset.py --output "$EVE_RUN/corpus-v3"
node toolkits/eve-model/prepare.mjs "$EVE_RUN/corpus-v3" "$EVE_RUN/observed-v3"
"$EVE_PY" toolkits/eve-model/prepare_training.py --corpus "$EVE_RUN/observed-v3" --base "$EVE_BASE" --output "$EVE_RUN/training-v4"
```

Review the corpus/protocol before training. The preparer refuses oversized examples rather than truncating them. Training uses a compact Eve system while integration uses the existing full Zema system; the transfer is exploratory. Both comparison arms receive the same integration context.

## Training and resource admission

The default `standard` profile requires4GiB of `free+inactive+speculative` pages,20GiB free disk, and normal OS memory pressure. `memory_pressure -Q` includes active pages in its pool percentage and does not prove that much additional RAM is available. RSS and Metal may overlap; neither should be added as disjoint memory.

`small-memory-v1` is an explicit optional alternative, not a successful standard gate: last2 layers/rank4/scale8,2.5GiB available-page start condition,2GiB RSS guard,1.75GiB Metal peak guard,1.5GiB MLX guideline and64MiB cache. It requires an external `resource-profile-decision.json` naming the adopted profile/reason and preserving `originalStandardGateAccepted:false`. No automatic fallback occurs. These two profiles refuse memory-pressure warning/critical and stop on missing monitoring, low available-page floor, worsening pressure, resource/time limits or nonfinite loss/adapter values. MLX's memory limit and one-second supervision are sampled controls, not hard allocation isolation. Metal is checked per validation batch and optimizer report.

The separately reviewed `bounded-warning-hypothesis-v1` permits OS warning level2 but rejects critical4 or unknown pressure. It requires3.25GiB available pages at admission and2GiB while running, limits a fresh run to8 updates, retains the small-profile RSS/Metal/cache bounds and stops active training at100 seconds within a120-second child envelope. OS queries have2-second deadlines/freshness limits. This is an experimental resource hypothesis, not acceptance of the original4GiB/normal-pressure gate. The completed candidate used this profile; changing its frozen profile after saving invalidates candidate binding.

```sh
"$EVE_PY" toolkits/eve-model/train.py --root "$EVE_RUN" --base "$EVE_BASE" --data "$EVE_RUN/training-v4" --updates 128 --profile standard
```

All runs share a durable128-update/1800-second reservation. Unknown updates stay charged and interrupted runs are not automatically resumed. An offline independently reviewed synchronous-callback proof may release only updates proved impossible, retaining the original reservation/history and one possible unrecorded update; the same transaction reserves the explicitly reviewed next run. Full supervisor wall time is charged. Each update and validation stage is saved immediately. Validation is explicitly8 batches before and8 after; an empty library validation dataset disables MLX-LM's otherwise automatic first/final-iteration evaluation. A completed same-base validation may be reused without rerunning it; a lost scalar remains unavailable. Prompt loss is masked, batch size1, sequence512, seed42, Adam1e-4 and gradient checkpointing. The actual generated LoRA config is checked against the selected profile. Nonfinite losses and final adapter values are rejected; no separate pre-update gradient-finiteness guarantee is claimed.

The supervisor owns only its child, propagates SIGTERM/SIGINT, then uses terminate→bounded wait→kill→wait. Full receipts and adapter weights remain in the run directory.

## Pixel client route

After candidate creation and independent bridge review:

```sh
node toolkits/eve-model/server.mjs "$EVE_RUN" "$EVE_BASE" "$EVE_PY"
```

It binds only127.0.0.1:18749. `pixel.py --root "$EVE_RUN" connect` binds the authorized USB target with a private salted serial digest and uses `reverse --no-rebind`; an existing unowned mapping is refused. `open` requires a successfully saved candidate, `capture --case ID` and `tap --text LABEL` require the exact localhost normal test page, and `cleanup` removes only an active owned mapping before revoking its ownership record. Notifications, tab switcher, URL editing and unknown overlays are refused. Saved XML contains only the browser subtree. Keep the nonce fragment and mode0600 external credential file outside Git; the page clears the fragment and checks the bounded session, Host, Origin, JSON size and fixed script CSP. Preserve Terminal input, existing jobs, apps, models, keys and other mappings. Do not install/clear/flash/reboot the device for this test.

The page labels the actual route: **Pixel browser → USB localhost → Mac MLX**. It reuses existing `prepareEveTextJob`, WorkJob preparation/cancel reducers and `runZemaLocalAgent` with the existing three pure Tools and three-step terminal rules. Its synthetic owner journal is separate from production accounts. A model response does not complete the saved WorkJob or approve its content.

Fixed synthetic case/arm/fault deep links select a case without starting inference. The Run button is latched while starting/active. Each job unloads its owned worker before completion; fatal resource exits remain fatal even if cleanup overlaps them. Same operation ID/payload reopens saved state without generation; conflicting payloads fail. Lost-acceptance and delayed-result cases are explicitly synthetic faults. Stop targets the current owned active operation even when the displayed ID is stale, waits for the owned worker and suppresses late output. Fatal resource/transport failures halt comparison rather than restarting the model for each case.

The comparison button runs the same20 development tasks in A=base and C=Eve, in fixed A-then-C order. It uses at most120 generation calls,256 output tokens/call and120 seconds per whole job. Additional physical functional tests use a separate30-call pool; the optional teacher pool is32×1200. All generation pools together are at most182 calls/76800 requested output tokens. Failed/unknown attempts remain charged. Loading/setup errors before a model generation are visible as failed jobs and are not reported as successful generations. Scripted repair's first failed Tool call is the same injected fault in both arms.

## Evaluation and verification

```sh
"$EVE_PY" toolkits/eve-model/evaluate.py --root "$EVE_RUN" --output "$EVE_RUN/comparison-diagnostics.json"
node --test tests/eve-model-toolkit.test.mjs
```

Independent semantic adjudication must supply every run ID exactly once with booleans or explicit unavailable values. Unknown/duplicate/missing identities and malformed judgments fail closed. Planned tasks, failed/not-started tasks, raw/parsed decisions, lexical diagnostics and semantic content/support are distinct. Strict-schema rates use all reserved generation attempts, including missing outputs; unassigned attempts are reported explicitly. Known generation time is not whole-phone interaction latency. No sealed test or80-prompt retention execution is authorized by the initial A/C budget; retention delta stays unavailable.

Physical P01–P10 require actual observed UI and stored state, including stop/reopen/unknown reconciliation. Unit fake planners, screenshots alone, historical phone models and previous smoke do not prove that this trained candidate ran on the Pixel, and do not prove native phone inference. Full repository verification and exact-SHA Git/CI status must be reported separately from model and physical evidence.
