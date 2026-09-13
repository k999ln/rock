# Protected release signing control

2026-09-11: 独立reviewerを用意できない場合に備え、本人が対象候補を確認して手動署名する別経路を準備する。二人承認は下記GitHub経路のproject policyであり、暗号署名全般の必須条件でも、利用者原文が指定した条件でもない。既存control/保護設定は保持し、別経路を独立した人の承認と表示しない。公開名はkaiya、具体的な署名方式と鍵保管は未承認・鍵未生成。[本人署名の入口と手順](owner-manual-signing.md) / [今回の設定](owner-setup-20260911.md)。

Status: **AWAITING_SIGNING_SETUP**, not LCH03 PASS. These files prepare authentication of candidate bytes. They create no production key/environment, register no secret, publish no release and change no native runtime, image, packager or installer. Existing `preview.py` remains a separate compatibility/installation gate; inner OS keys remain public development fixtures even if an outer release is signed with a managed identity.

2026-09-12: `npm run release:signing:check` で候補準備15件、owner legal approval 11件、保護署名29件、本人署名7件、合計62件の公開fixture回帰を一つにし、通常の `npm run verify` へ組み込んだ。試験数が減った場合も失敗する。これは署名機構と拒否境界の回帰確認であり、production鍵、owner承認、隔離環境、実候補署名または署名後受入の実施証拠ではない。

## Current observed setup

2026-09-10: `gh api repos/k999ln/rock/environments/rock-release-signing` returned HTTP404. No production identity or approval configuration was inferred. These example trust/policy files deliberately fail closed. GitHub Actions pins were resolved from official `actions/checkout`, `actions/upload-artifact`, `actions/download-artifact` v4 Git ref API responses at implementation time; see immutable refs in the workflow.

## Trusted code and secret boundary

Only `workflow_dispatch` is accepted, for repository `k999ln/rock`, ref `refs/heads/codex/release-signing-control`, and the exact reviewed SHA in repository variable `ROCK_SIGNING_CONTROL_SHA`. Checkout uses that immutable SHA with credential persistence disabled. Neither PR source nor archive content supplies executable code. Both jobs use fresh GitHub-hosted Ubuntu24.04, pinned actions, Python standard library, existing OpenSSL3 and gh; the secret job performs no dependency installation, build, cache restore, package import, archive extraction or execution.

Before any approval and again after Environment approval, real GitHub API responses must show:

- Exact Environment `rock-release-signing` and independently agreed individual reviewer User IDs, with `prevent_self_review: true`.
- Exactly one custom deployment branch policy: `codex/release-signing-control`, type branch. No wildcard/tag/all-protected-branches route.
- Control branch locked, admin enforcement enabled, force pushes/deletion disabled; reviewed updates require >=1 approving review, stale-review dismissal and last-push approval; all PR bypass allowances explicitly proven empty.
- Live control ref still equals the immutable configured SHA.

When REST returns `bypass_pull_request_allowances`, all three explicit lists must be empty. A present null, malformed or nonempty value always rejects. If that key is absent (observed on this personal repository), read GraphQL and require an error-free response for the exact repository, branch name and `refs/heads/` prefix, Commit SHA, protection rule ID/pattern, and integer `totalCount: 0`. Missing data, wildcard rules, changed refs and non-integer counts reject. `first:1` does not truncate the connection total. See [Ref](https://docs.github.com/en/graphql/reference/git#ref) and [allowance connection](https://docs.github.com/en/graphql/reference/branches#bypasspullrequestallowanceconnection).

After the Environment gate and before exposing the signing key, the API must also show exactly one explicit `approved` review for the current run's numeric Environment ID and name, from an allowlisted individual who is neither the run actor nor its triggering actor. The run must be a first-attempt dispatch of the exact control ref/SHA/workflow. Missing, rejected, self-approved, ambiguous or administratively bypassed approval history refuses signing. Team membership cannot stand in for an individually allowlisted reviewer.

GitHub's Environment REST/GraphQL schemas do not expose the UI administrator-bypass setting. Disable that UI setting during owner setup; this preflight honestly reports it as `NOT_EXPOSED_BY_GITHUB_API` instead of inventing a field or claiming it was verified. The separate actual-approval check enforces the signing authorization even when a waiting Environment job is bypassed. Approval history has no attempt timestamp, so workflow reruns are refused: make a fresh dispatch and independent approval for every attempt. Missing permission,404/403, changed ref, wildcard deployment access and nonempty PR bypass allowances also refuse signing. Administrators controlling repository code, variables and secrets remain within the trusted operating boundary; these checks cannot prevent them from changing that trust root. Keep administrative audit logs and restrict that role.

`ROCK_SIGNING_POLICY_READ_TOKEN` is a separate least-privilege read-only GitHub App/fine-grained token able to inspect repository Administration/Actions policy. It contains no signing key and has no write/Secrets access. The preflight job needs it before Environment approval; do not put the production signing key in repository secrets. Downloading candidate data uses the read-only GITHUB_TOKEN. Signing uses only the Environment secret `ROCK_RELEASE_SIGNING_KEY_PKCS8_B64`, a base64 encoding of an existing 48-byte unencrypted Ed25519 PKCS8 DER key. It is passed only to the signing step, removed from the process environment immediately, written only under a0700 temporary directory as0600, and removed on normal/error/SIGTERM completion. SIGKILL/crash cleanup relies on hosted-runner disposal; this is not a forensic secure-erasure claim. No secret data or OpenSSL stderr is printed. The output contains public DER, signatures and hashes only.

## Owner setup before the first production run

1. Review the scripts/tests/workflow. Create the dedicated control branch by normal Git operations. Review all code in its exact commit. The personal-repository GitHub branch-protection payload is `data/release-signing-control-protection.json`; apply it only to `codex/release-signing-control`, read back every required field and the exact ref, and set `ROCK_SIGNING_CONTROL_SHA` to its40-character SHA. GitHub rejected even empty `bypass_pull_request_allowances` on this personal repository with422; this payload omits that unsupported field and preflight still requires explicit GraphQL zero, never an absence-as-empty assumption. That payload contains no key, reviewer identity or Environment claim. Do not force push. A reviewed control update requires a brief authorized unlock, independent review, new exact SHA pin and relock before dispatch.
2. Confirm a second approving person and their exact GitHub numeric User ID. The dispatcher and triggering actor must not approve their own run. Fill `data/release-signing-policy.json` from the example on the control branch. Configure the actual Environment, disable administrator bypass in its UI and compare exposed API policy fields. A fresh independently approved dispatch is required for every attempt; preflight is enforcement, not a substitute for setup.
3. Select the managed release-key owner and existing secret custody mechanism. Key generation/storage is not performed here. Populate `data/release-trust.json` on the reviewed control branch with generation, UTC Unix-second validity, and identities `{fingerprint,public_der_hex,status,not_before,expires_at}`. `fingerprint` is SHA-256 of44-byte Ed25519 SPKI DER, `public_der_hex` is88 lower-case hex characters, `status` active/revoked. Never store a private key in either file. All distinct RFC8032 Ed25519 test keys are refused by the CLI.
4. Independently publish the trust bundle's exact SHA-256, the public key fingerprint and the trusted offline verifier/control-source SHA through the owner's trusted support/domain/release policy channel, separate from downloadable release assets. Set Environment variable `ROCK_RELEASE_KEY_SHA256` to that fingerprint. Register the managed PKCS8 secret in the Environment only. Configure the read-only policy token separately.
5. Confirm GitHub has registered the dispatch workflow. GitHub documents that first manual registration needs its workflow file on the default branch. On resume, the workflow API still returns404; `--ref` selects an execution ref and does not register this never-run workflow. [Draft PR #5](https://github.com/k999ln/rock/pull/5) prepares only the reviewed workflow file, based on unchanged main `7cdbb5fedc86ee3978ed329d9312147d137c9199`; bootstrap HEAD is `a4411622031858d6d9684c599d857cadaf90bb94`. It is not merged. The user must explicitly authorize that limited main bootstrap before a real protected dispatch can be rehearsed. This is an ordering dependency: requiring LCH03 rehearsal before allowing any main change cannot complete with this GitHub bootstrap. Do not add a push-trigger workaround or claim that creating the Draft registered the workflow. A separately approved bootstrap changes main, so recheck the final product PR #4 tree/CI afterwards.
6. Run the protection preflight and reject any incomplete configuration. Registering only a key is insufficient. Record approver/time/controlSHA/candidatepins without secret values.

## New candidate inputs

The unsigned producer and control-side preparation bridge are now implemented in [candidate-preparation.md](candidate-preparation.md). They require a NEW source-bound frozen build and independently pinned producer receipt; no managed key is used in candidate generation. Existing signed/public-test envelopes cannot be converted by removing or relabeling fields. The current producer/bridge deliberately require NOT_CLEARED/CANDIDATE: an owner's future license decision needs a further reviewed legal-metadata/policy implementation and target-specific acceptance, not merely rerunning these unchanged commands.

Prepare a NEW Draft Prerelease with `target_commitish` equal to the exact40-character sourceSHA. Never overwrite/relabel the old9ab draft. All candidate assets must match `candidate-index.json`, itself pinned independently in dispatch inputs:

```json
{
  "schema": "rock-release-candidate-inputs/1",
  "source_commit": "<40 lower-case hex>",
  "host_tools_commit": "<40 lower-case hex>",
  "version": "<new version>",
  "issued_at": 1789070400,
  "assets": {
    "candidate-manifest.json": {"sha256": "<64 lower-case hex>", "bytes": 123},
    "rockstaros-<new version>-macos-arm64.tar.gz": {"sha256": "<64 lower-case hex>", "bytes": 123}
  }
}
```

The timestamp is a reviewed fixed input so repeated separately approved dispatches sign identical bytes. Add every independently distributed NOTICE/source/SBOM/instructions/media asset to the index; no extra draft asset is accepted. `candidate-manifest.json` is the plain existing `rockstaros-preview-release/2` manifest payload, with `trust: EXTERNAL_RELEASE_KEY`; the old signed public-test envelope is refused. It must already describe a newly and reproducibly assembled candidate and exact source/host-tools/image/member hashes. This scaffold does not create a fresh Buildroot image or convert NOT_CLEARED/CANDIDATE into accepted status. It preserves those fields verbatim if supplied. The candidate preparation pipeline may emit an unsigned external-key payload before the protected signing job; adding that pipeline to frozen host tooling requires its own source/artifact acceptance.

The downloader accepts numeric GitHub release/asset IDs only, same repository, uploaded assets only, bounded names/sizes/counts, complete pinned inventory, and exact bytes. It never follows a user-provided arbitrary URL. The signer hashes all assets and streams strict regular-file USTAR headers matching the existing packager. PAX/GNU metadata extensions are rejected before their payload can be allocated. It checks all member bytes/types/modes, missing/extra/link/path traversal constraints, bounded member expansion and bounded zero-only end padding, and consumes the gzip stream through EOF. It never extracts or executes it.

## Outputs and offline verification

The workflow uploads only `signed-metadata-not-launch-accepted`: `release-manifest.json` (unchanged existing v2 envelope format), `release-key.der`, `release-authentication.json` (separate signed all-assets statement), and `SIGNED-SHA256SUMS`. It has no release publication permission. Collate those four files with the original indexed assets except `candidate-index.json` and `candidate-manifest.json` in a new verification directory. Do not alter archive/source/media bytes.

Acquire the verifier and current trust-bundle pin independently. Then, with all shell variables set to reviewed literal values:

```sh
python3 scripts/release_signing.py verify \
  --directory "$FINAL_DIRECTORY" \
  --trust-bundle "$INDEPENDENT_TRUST_BUNDLE" \
  --trust-sha256 "$TRUST_BUNDLE_SHA256" \
  --fingerprint "$PUBLIC_KEY_SHA256" \
  --manifest-sha256 "$RELEASE_MANIFEST_SHA256" \
  --source "$SOURCE_SHA"
```

This verifies current trust validity/revocation, both signatures, source/version/fingerprint/manifest pins, every external asset, archive member hashes and checksum-list equality. Success means `AUTHENTICATED_NOT_LAUNCH_ACCEPTED`. Existing independently sourced `preview.py verify` must still pass its full supported-host/schema/bootstrap checks with the external key and independently pinned final manifest. Archive authentication alone does not certify license, TLS regression, runtime security or installation acceptance.

## Rotation, revocation, emergency stop and loss

- Rotate via a separately approved new managed key. Derive/publish its public DER fingerprint, update reviewed trust bundle generation/validity, retain active old identity only during the explicitly allowed overlap, and register the new Environment secret/fingerprint after approved control update. Do not regenerate or expose either secret in this task.
- A current independently pinned bundle governs verification. The signed statement also records its original trust-bundle hash for provenance; it does not require continuing to use obsolete trust. An old valid signature remains acceptable only while that identity is active in the CURRENT pinned bundle. Expired bundle, expired identity and revoked identity fail.
- Revoke a compromised/lost identity by a new trust generation with its status revoked; separately distribute the new pin. Disable the workflow and Environment access immediately, revoke/remove the affected secret using administrator controls, pause affected draft/public download links, and publish the fingerprint/release list through the trusted support channel. Preserve incident evidence; do not rewrite old hashes or signatures.
- Offline machines with an old still-valid pin cannot learn a new revocation automatically. Bundle expiry bounds this gap; correct local UTC time and a freshly obtained independent pin are verification prerequisites. No online revocation lookup is implied.
- Loss: halt signing, retain public verification evidence, review whether revocation is necessary, provision a replacement through the approved custody process, then repeat rotation and clean-environment tamper/fingerprint checks. No emergency public test key fallback.

## Validation and unresolved evidence

Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_release_signing.py -v`. Tests use only published RFC8032 fixture seeds. Production CLI refuses every RFC key; successful crypto/rotation mechanics tests temporarily replace the denylist inside the TEST process only, with no runtime bypass flag. Tests cover signature/asset/manifest/source/fingerprint tamper, unknown/revoked/expired keys and bundles, trust-generation rotation, duplicate JSON, extra inputs, tar links/PAX/GNU/trailer attacks, filesystem links, policy bypass/wrong branch, independent approval/self-review/rerun rejection and deterministic repeat signing. These tests do not demonstrate a managed production key, real GitHub Environment approval, a Linux hosted signing run, current-ref protection, or the final1GB candidate.

LCH03 remains open until real setup, independent approval, final managed-key signing, separate trusted fingerprint/bundle publication, and clean-environment authentic/tampered/fingerprint/expiry/revocation checks all have target-specific evidence. Missing Environment, owner/reviewer, key custody/registration, public trust channel and potential default-branch dispatch registration are explicit setup items.

The [initial-registration feasibility evidence](evidence/launch/signing-bootstrap-feasibility.md) records the actual missing-workflow readback, official GitHub rules and independent review of the one-file bootstrap Draft. This is a dependency/permission record, not an executed protected signing run.

Primary references: [GitHub Environment REST API](https://docs.github.com/en/rest/deployments/environments), [GitHub deployment branch policies](https://docs.github.com/en/rest/deployments/branch-policies), [GitHub workflow dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), [GitHub workflow review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run), [RFC8032 test vectors](https://www.rfc-editor.org/rfc/rfc8032.html#section-7).

## Actual setup snapshot

Control branch and repository variable `ROCK_SIGNING_CONTROL_SHA` are pinned to `ca7356550b0042d05f60a389a90aebd5210510e6`. REST readback confirms locked/admin enforcement, disabled force pushes/deletion, stale-review dismissal and last-push approval; an independent GraphQL read proves the exact branch/SHA/rule has zero PR bypass allowances. This compatibility fix is in the later product candidate and is **not installed on that locked control SHA**. Do not unlock or bypass approval to synchronize it automatically. A separately authorized, independently reviewed control update must include the owner policy/trust, followed by a new pin and relock/readback. Environment, reviewer identity, managed key, independent trust publication and real signing remain pending. Draft PR #5 only prepares the initial workflow registration and is not merged. This is not a production preflight PASS.
