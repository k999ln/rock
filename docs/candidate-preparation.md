# New unsigned candidate preparation

Status: **TOOLING_PREPARED; FRESH_PRODUCER_EXPORT_NOT_RUN**. This closes the implementation gap between packaging and protected signing. It does not finish LCH03/LCH07, build an OS image, select a license or create a key. The prior public-test candidate, frozen source and acceptance remain historical evidence.

The producer at source `97d952937add42de04092a2e6c2fac8aba3d8bad` supported only `--public-test-signature` or an existing `--signing-key`. It always signed and called signed-release verification. Its own file and `preview.py` also had to match the frozen build's source inventory. Removing the old envelope or changing its trust/version/source would not create a legitimate unsigned new candidate. An unsigned export therefore requires the explicit producer change below, a new committed source/freeze, and target-specific acceptance after final content decisions.

## Two separate operations

`systems/rock-star-os/os/desktop/package_preview.py --unsigned-external` is mutually exclusive with both signing modes. It retains the exact source-tested frozen build, complete native-source inventory, current producer/bootstrap hashes, image triple, configuration, stage0 factory and Game profile checks. The final manifest uses the existing v2 payload format with `EXTERNAL_RELEASE_KEY`, `NOT_CLEARED` and `CANDIDATE`. That trust label states the required eventual verification key; no signature exists yet. The new mode emits `candidate-manifest.json` and `candidate-export.json`, the archive, standalone `preview.py` and three installation/legal documents. It emits no release key, signed envelope, signed verification result or `PACKAGED_NOT_ACCEPTED` receipt. Existing signing modes keep their behavior.

`scripts/prepare_release_candidate.py` runs from independently reviewed control code. It consumes the unsigned directory as data. It never imports its bootstrap, producer or archive code, extracts the archive, invokes Git/build tools, contacts GitHub, accesses a signing key or changes legal/acceptance metadata. After all staging validation, exclusive mkdir reserves a fresh output directory. Asset creation uses exclusive file descriptors anchored to that directory, independent byte copies, no links and no executable permissions. The index is written last; caught interruption removes only this attempt's incomplete index and preserves the incomplete directory for diagnosis. A new attempt must use a new output directory. Uncatchable process/host death can leave a partial index; its independent hash and inventory must still pass before acceptance. It emits deterministic `candidate-index.json` and exactly the indexed asset bytes expected by `release_signing.py` and its draft downloader.

The source-build job still executes its own reviewed packager/source validation, without a production signing key. The later protected signing job continues to execute only control code. Do not run a producer from downloaded candidate data inside the signing job.

## Invariants enforced by the bridge

- Independently provided SHA-256 pins identify the exact unsigned export receipt and previous-release identity; both are strict bounded JSON. The new source and version must differ from that prior identity. The archive SHA must also differ. The previous record is an explicit reviewed input, not a hidden hardcoded version.
- Export schema/status and exact output names are checked. Public-test manifests, signed envelopes, signed-release output files, malformed or extra names, symlinks, hardlinks, changed assets and unsafe inventory are refused. Repackaging/relabeling the old archive is not an allowed migration path.
- Exact caller-provided source/host-tools/version and fixed nonfuture issuance time bind `candidate-index.json`. The export and all supplemental bytes remain unchanged; no timestamp is invented on each run.
- The existing signing validator checks all archive member paths, types, sizes, hashes and modes with strict regular USTAR parsing, including PAX/GNU rejection and bounded gzip end padding. The bridge then reads only bounded freeze metadata from its private already-validated copy. It does not extract any member to disk.
- The embedded freeze must declare the same source/image hashes, source tests PASS/unchanged and verified source archive. Every native member hash must exactly match the freeze inventory, including the producer and bootstrap. The receipt's producer hash must match that frozen producer. Standalone bootstrap/documents and frozen build configuration must match their archive copies.
- Only `legal.status: NOT_CLEARED` and `acceptance.status: CANDIDATE` are accepted. Neither supplemental notices nor signing changes those statuses into clearance or runtime acceptance.
- Optional supplemental NOTICE/source/SBOM/instruction/media assets use a separately pinned, source/version-bound inventory. They cannot replace package/control metadata. All resulting assets together stay within the signing pipeline's 128-asset/12-GiB bounds. Inputs and outputs never overwrite earlier candidates.

Pins authenticate the reviewed input selection, not the truth of arbitrary build claims. An attacker who can replace the independently trusted pins and trusted control code controls the trust root. A forged freeze alone is not proof of a successful build; real source/build/acceptance evidence must accompany the selected export. Physical installation, embedded development keys, licenses and bootstrap compatibility remain independent gates.

## Deferred production procedure

1. Resolve final license/NOTICE/source-bundle decisions and any runtime changes. Review/commit the producer addition and complete final source contents. Freeze and test a NEW source-bound build through the existing producer checks. Do not rewrite the old freeze to match the added producer.
2. Invoke the normal packager with the complete new source SHA, frozen image directory, new version, explicit boot profile and `--unsigned-external`, using a new output directory. Supply actual `--legal-info` when appropriate. No production key belongs in this operation.
3. Review the unsigned export, source/build evidence and `candidate-export.json` SHA-256. Obtain the exact previous release identity from independent release records, for example:

```json
{"schema":"rock-previous-release/1","source_commit":"<previous 40-hex SHA>","version":"<previous exact version>","archive_sha256":"<previous archive 64-hex SHA>"}
```

Optional supplemental directory metadata is named `candidate-supplements.json`:

```json
{"schema":"rock-release-candidate-supplements/1","source_commit":"<new 40-hex SHA>","version":"<new version>","assets":{"NOTICE.txt":{"sha256":"<64-hex SHA>","bytes":123}}}
```

4. Run the bridge with reviewed literal values. The issuer timestamp is fixed for the candidate, not the run:

```sh
python3 scripts/prepare_release_candidate.py \
  --export-directory "$UNSIGNED_EXPORT_DIRECTORY" \
  --export-sha256 "$INDEPENDENT_EXPORT_SHA256" \
  --previous-release "$PREVIOUS_RELEASE_IDENTITY" \
  --previous-sha256 "$INDEPENDENT_PREVIOUS_SHA256" \
  --source "$NEW_SOURCE_SHA" --version "$NEW_VERSION" \
  --issued-at "$REVIEWED_UTC_UNIX_SECONDS" \
  --output "$NEW_CANDIDATE_DIRECTORY"
```

Supply both `--supplements-directory` and `--supplements-sha256` when supplemental assets are required. The output JSON reports `UNSIGNED_CANDIDATE_PREPARED_NOT_ACCEPTED` and the final candidate-index hash. It is a summary for separate evidence storage, not an extra unindexed candidate asset.

5. Independently review/pin the complete index. Create a NEW Draft Prerelease at the exact source SHA and upload precisely the prepared directory. Creation/upload is a separate authorized operation; the bridge performs neither. Continue through the protected signing workflow and separately pinned offline verification in `docs/release-signing-operations.md`. A fresh independently approved dispatch is required for every signing attempt.
6. Final source/archive/manifest/key identities must receive actual fresh-install/runtime/legal/expiry/revocation verification before LCH07 or launch is accepted. Generated unsigned fixtures do not satisfy those gates.

## Validation

Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_prepare_release_candidate.py -v` and the existing `test_release_signing.py` suite. Existing native desktop regression: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s systems/rock-star-os/tests -p test_os_desktop_preview.py -v`.

Scratch verification on 2026-09-10: 15 bridge/producer tests, 22 signing tests and 50 existing desktop tests pass. Fixtures cover a real CLI invocation, full unsigned packager branch with signing and signed verification forbidden, deterministic repeated output, unchanged copied bytes, source/version/time pins, previous archive rejection, producer/freeze/native/bootstrap binding, public/signed envelopes, acceptance promotion, asset tamper, links, extras, supplements, existing Namespace callers, racing empty output directories, interrupted asset publication and interrupted index flush. The race test preserves the existing directory inode and all interruption paths refuse success/retry overwrite. The full unsigned branch uses mocked Git/source/stage0 inputs and tiny image fixtures; it is not a real OS build or managed-key signing run.
