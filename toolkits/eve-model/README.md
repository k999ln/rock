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

All runs share a durable128-update/1800-second reservation. Unknown updates stay charged and interrupted runs are not automatically resumed. An offline independently reviewed synchronous-callback proof may release only updates proved impossible, retaining the original reservation/history and one possible unrecorded update; the same transaction reserves the explicitly reviewed next run. Full supervisor wall time is charged. Each update and validation stage is saved immediately. Validation is explicitly8 batches before and8 after; an empty library validation dataset disables MLX-LM's otherwise automatic first/final-iteration evaluation. A completed same-base validation is reused only with the exact current loss/source/runtime/data binding and a persisted finite scalar. Historical lost scalars and the old inclusive-mask baseline are rejected by the corrected runner. Prompt loss is masked, batch size1, sequence512, seed42, Adam1e-4 and gradient checkpointing. The actual generated LoRA config is checked against the selected profile. Nonfinite losses and final adapter values are rejected; no separate pre-update gradient-finiteness guarantee is claimed.

The supervisor owns only its child, propagates SIGTERM/SIGINT, then uses terminate→bounded wait→kill→wait. Full receipts and adapter weights remain in the run directory.

The separate CPU-only audit of installed MLX-LM0.32.2 confirmed one extra trailing padding target (token ID0, `!`) in all240 training and8 validation rows, with normal prefixes and unchanged historical integration-request hashes. This observation does not establish the cause of repeated-schema output. The saved failed candidate, its runtime and recipe remain unchanged. A future independently reviewed loss-boundary fix, frozen protocol and fresh training/comparison are required; this candidate is not a corrected model. The existing16 teacher-forced validation batches are already consumed, and this session performs no further model trial. Audit review SHA256: `5213d9f73c6f18ed3519bbd3e7f943af61dab01490c8e4c3200e20ca737b916f`.

## Matched-input quality recovery

The current runner uses an explicit assistant-only loss: for real token length `N` and prompt-prefix offset `O`, supervised target indices are `O <= s < N`. The first answer and genuine closing tokens remain supervised; every prompt/padding target is excluded. All source rows and every actual batch are checked before the compiled optimizer. The cached MLX environment is not patched. Historical candidates trained with MLX-LM0.32.2's inclusive default remain unchanged and are not relabelled as corrected.

For the prior separately invoked recovery recipe, prepare the integration system and planner prompt from the existing pure Zema runtime:

```sh
node toolkits/eve-model/prepare_integration.mjs "$EVE_OBSERVED" "$EVE_RUN/integration-chats"
"$EVE_PY" toolkits/eve-model/prepare_training.py --corpus "$EVE_OBSERVED" --base "$EVE_BASE" --output "$EVE_RUN/training" --integration-chats "$EVE_RUN/integration-chats"
```

This path retains all240 original train tasks, complete2–4 source text and exact gold decisions. It selects four declared validation records, balanced Japanese/English and including three/four-source and repair cases. Repair observes only the actual earlier pure-Tool rejection. No sealed data, model generation or future observation is used in preparation. At the prior recovery source snapshot, the measured train maximum739 and validation maximum686 fit768 tokens without dropping facts or truncation. The four validation records share a renderer family and do not establish broad generalization.

The independently reviewed `matched-768-v1` profile uses one final layer/rank4/scale8, sequence768, the same3.25GiB admission/2GiB runtime floor,2GiB RSS/1.75GiB Metal guards,1.5GiB MLX guideline,64MiB cache and100-second active cutoff within120 seconds. A successful small resource probe and fresh admission are required; the longer sequence is not assumed safe from an earlier512-token peak. Each new training run saves its own admission snapshot before spawning the child, while retaining the legacy latest snapshot. Older overwritten evidence cannot be reconstructed by this change.

A v2 resource decision may explicitly adopt the two named fixed profiles for old-reference diagnostics and new training. Old profile definitions are frozen for original candidate binding. Session `generationLimits` only restrict the hard ceilings. The recovery allocation is diagnostic20, comparison120, Pixel30, teacher0:170 calls/43,520 requested output tokens. Old sessions retain diagnostic0 by default. Durable training slots include legacy512 allocations and unknown reservations; total limits remain128 updates/65,536 training slots and16 validation batches/8,192 validation slots.

The resource probe has8 updates and no global candidate publication. Four same-base BEFORE validation batches can be reused only with matching base/data/template/loss/source/runtime/profile bindings and a persisted finite scalar. A fresh-base final run uses a preregistered resource-only choice from72/48/16 updates and four AFTER batches. It does not resume the probe's weights or choose a model from quality outputs. Dataset/source changes reject before-loss reuse. New-vs-old learning is a bundled recipe change; the loss fix alone is not established as the cause of any quality difference.

```sh
"$EVE_PY" toolkits/eve-model/train.py --root "$EVE_RUN" --base "$EVE_BASE" --data "$EVE_RUN/training" --updates 8 --profile matched-768-v1 --run-id eve-recovery-probe --candidate-name probe-v1
# Freeze the resource-only final-update decision before the fresh-base run.
"$EVE_PY" toolkits/eve-model/train.py --root "$EVE_RUN" --base "$EVE_BASE" --data "$EVE_RUN/training" --updates 48 --profile matched-768-v1 --run-id eve-recovery-final --candidate-name candidate-v1 --reuse-before eve-recovery-probe
```

`diagnose.mjs` supports a separately frozen raw20-cell system/old-weight diagnostic. It reads the original candidate and compact-system training source without changing their files, charges the new run's diagnostic pool and holds the same full integration user prompt fixed across systems. These single decisions are not Tool-loop task acceptance. The formal comparison retains all20 tasks per arm and its own pool; host initiation is recorded as supporting evidence and does not replace physical Pixel cases.

## Semantic-quality repair

The previous48-update run traversed only48 of240 examples (including one count/duration synthesis example), and its240 examples contained no successful Tool-observation→final-response trajectory. The original serving instructions also contained explanatory strings such as `ja または en` which an actual failed reply copied literally. These are recorded coverage/instruction defects; save/load or loss-mask failure was not established by the CPU trace reconstruction. A prompt-only20-cell ablation holds the same five USER prompts and reference weights fixed. Raw schema success is not Tool-loop completion.

`prepare_semantic.mjs` selects40 representative first decisions across the six existing training families, ten task types, both languages and both clean/adversarial variants. It adds12 actual successful-Tool follow-ups, plus four separately authored `coconala_check` positives and their four actual follow-ups. The60 rows retain complete inputs and past errors, order the schema/action/Tool before arguments, and reject duplicate captured train/validation inputs. The standalone positives use distinct domain/seed text rather than mixing another task's intent. Their values and outputs are not claims about real applications, compliance or revenue. Four selected validation rows use heldout source families and distinct captured inputs; shared authored schemas do not establish real-world generalization. The final reviewed preparation measured625/592 maximum train/validation tokens within768.

```sh
node toolkits/eve-model/prepare_semantic.mjs "$EVE_ALLOWED_OBSERVED" "$EVE_RUN/semantic-chats"
"$EVE_PY" toolkits/eve-model/prepare_training.py --corpus "$EVE_ALLOWED_OBSERVED" --base "$EVE_BASE" --output "$EVE_RUN/training" --semantic-chats "$EVE_RUN/semantic-chats"
```

The new `eve-semantic-probe` keeps8 updates separate from the quality candidate. A fresh `eve-semantic-final` requires64 or72 updates chosen only by the frozen resource formula `firstReportElapsed + N*maxAdjacentInterval +15 <=90` from the completed probe, choosing the largest qualifying N; if neither qualifies, stop. It preserves the matched768 memory/stop profile and completed bound before-loss reuse. Maximum probe+final reservations are80 updates/61,440 training slots and8 validation batches/6,144 slots. Actual optimizer reports identify completed curriculum rows; a final run must cover all60 distinct rows in its first epoch. A CPU schedule prediction is not reported as actual optimizer coverage.

```sh
"$EVE_PY" toolkits/eve-model/train.py --root "$EVE_RUN" --base "$EVE_BASE" --data "$EVE_RUN/training" --updates 8 --profile matched-768-v1 --run-id eve-semantic-probe --candidate-name probe-v1
# Compute and freeze the resource-only update decision after a successful probe.
"$EVE_PY" toolkits/eve-model/train.py --root "$EVE_RUN" --base "$EVE_BASE" --data "$EVE_RUN/training" --updates "$EVE_SELECTED_UPDATES" --profile matched-768-v1 --run-id eve-semantic-final --candidate-name candidate-v1 --reuse-before eve-semantic-probe
```

Semantic CPU preparation supports only the pinned Qwen2.5 chat-template hash and plain system/user prefix or system/user/assistant row. It renders that exact text branch without executing Jinja or escaping chat content, rejecting other roles, fields, content types, tools and templates. Post-evaluation CI hardening proved identical full/prefix token arrays and assistant offsets for all64 prepared rows (128 vectors); the existing candidate was trained with the preserved earlier source. Diagnostic output publication uses exclusive creation, including a competing-writer refusal before Planner construction. These CPU controls do not add training, model evaluation or physical acceptance.

The gated diagnostic operator entry is `diagnose_start.py --root ... --base ... --python ... --candidate-root ...`. A failed fresh admission raises before any Node child is started; startup evidence is write-once. The separately reviewed semantic diagnostic checks all five input hashes and both system hashes before creating the Planner. A manual startup-only resumption requires its actual review/decision/protocol/failure hashes, no existing call ledger, a different fixed output and new attempt IDs; it never rewrites the first failure or creates an automatic fatal retry.

A broad unit test initially generated temporary synthetic test/retention fixtures in this session. Their fixed originals were not opened and the temporary contents were not used for learning or model evaluation. That incident remains recorded; generation is not claimed to be zero. `dataset.build(..., splits=[...])` now selects allowed families before constructing rows, and the unit suite uses train/validation/development only, with guards against constructing test/retention rows. The full original corpus-build command above includes excluded splits and must not be used during an excluded-data session. Semantic preparation reads only the named existing train/validation files. Keep old run data, sealed/retention sources and private device/credential bindings outside this work.

The recorded semantic run completed probe8 plus fresh final72 updates, traversed all60 rows, and reduced mean loss over the same four validation rows from1.1240 to0.6024. Independent completion remained A0/20, C1/20 and physical primary0/10, so this candidate is rejected and nondefault. Target outputs are33–90 tokens, while13 comparison generations repeated until256; a larger output limit is not an evidenced fix. Preserve all failures, the source/incident receipts and the limited late-stop claim; use a new preregistered same-system experiment for the remaining answer-placeholder and semantic defects. See [the current evidence](../../docs/evidence/development-execution/eve-semantic-quality.json).

## Pixel client route

After candidate creation and independent bridge review:

```sh
node toolkits/eve-model/server.mjs "$EVE_RUN" "$EVE_BASE" "$EVE_PY"
```

It binds only127.0.0.1:18749. `pixel.py --root "$EVE_RUN" connect` binds the authorized USB target with a private salted serial digest and uses `reverse --no-rebind`; an existing unowned mapping is refused. `open` requires a successfully saved candidate, `capture --case ID` and `tap --text LABEL` require the exact localhost normal test page, and `cleanup` removes only an active owned mapping before revoking its ownership record. Notifications, tab switcher, URL editing and unknown overlays are refused. Saved XML contains only the browser subtree. Keep the nonce fragment and mode0600 external credential file outside Git; the page clears the fragment and checks the bounded session, Host, Origin, JSON size and fixed script CSP. Preserve Terminal input, existing jobs, apps, models, keys and other mappings. Do not install/clear/flash/reboot the device for this test.

Open the authorized test page once, then use `python3 toolkits/eve-model/pixel.py --root "$EVE_RUN" select --case CASE_ID --arm C --fault none` between cases. Selection is authenticated and idle-only, creates no job and calls no model. Require `uiConfirmed=true` before separately pressing Run. The helper matches each exact `case`/`arm`/`fault` element ID, selected text, enabled state and visible bounds on the observed Android View or legacy Spinner; generic result text does not count. Failure means no Run, no fallback opening more tabs. The optional physical fixture schema2 binds the three fixed extra IDs by file/source hashes; they never enter the20-case comparison.

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
