# Future detached owner legal approval

Status: **VERIFIER_PREPARED; OWNER_DECISION_NOT_RECEIVED**. No license, approving authority, production key or final publication approval is chosen here. LCH02 remains open. This verifier consumes a later explicit owner decision; it never creates one.

The producer's `NOT_CLEARED` and `CANDIDATE` describe the build-time state. Editing either value after approval would change the approved manifest/index. Instead, a detached decision can bind the exact final candidate bytes and its legal materials. `verify_owner_legal_approval.py` returns `OWNER_LEGAL_APPROVAL_VERIFIED_NOT_LAUNCH_ACCEPTED` and reports those original build-time states separately. It does not rewrite them or issue a legal opinion.

## Independently supplied records

The owner must explicitly authorize the exact decision and its authority through a trusted channel outside the candidate. Independently obtain both the decision SHA-256 and the **current** policy SHA-256; do not calculate a supposedly trusted policy from an untrusted downloaded decision. Hashes authenticate selected bytes, not the truth of an unsigned identity or legal assertion. A supplied authority ID is a reference to that outside authorization, not identity proof. This code introduces no identity service or signing scheme.

The policy is strict JSON with exactly `schema: rock-owner-legal-policy/1`, `repository: k999ln/rock`, positive integer `generation`, integer Unix `not_before` / `expires_at`, and `approvals`. Each approval entry has exactly `approval_sha256`, `authority_id`, and `status: active | revoked`. There must be 1–32 distinct entries and exactly one active match. Empty/unconfigured policy, missing authorization, expiry, future validity and revocation fail closed. Generation is audit metadata; the caller's independently obtained current pin determines freshness. An old still-valid policy must not be substituted after revocation.

The decision has exactly these fields:

- `schema: rock-owner-legal-approval/1`, `repository: k999ln/rock`, the authorized `authority_id`, `decision: APPROVED`, and `scope: LEGAL_REDISTRIBUTION_OF_IDENTIFIED_BYTES_ONLY`.
- `not_before` / `expires_at` as integer Unix times. The decision cannot predate the candidate's issue time, and both policy and decision must remain valid through completion of verification.
- Exact `source_commit`, `host_tools_commit`, `version`, and `candidate_index_sha256`; both source identities must match the explicitly requested source.
- `candidate_manifest` and `archive`, each exactly `{name, sha256, bytes}`, matching the indexed manifest and archive. Every indexed asset and every regular USTAR member is independently checked.
- Explicit owner-selected `license_identifier`. This is a label for the reviewed material, not a parser's legal interpretation or a newly selected license.
- `materials`, with all seven roles: `license`, `license_scope`, `notices`, `inventory`, `corresponding_source`, `redistribution_instructions`, `exceptions`. Each contains 1–32 distinct records `{location, name, sha256, bytes}`. `location` is `asset` or `archive-member`, and the material must match the candidate's checked inventory. If there are no exceptions, include the owner's reviewed, pinned empty-exceptions statement. Semantic completeness and rights remain the owner's reviewed assertions, not conclusions derived from a filename.
- `attestations`, with exactly `licensing_authority_and_scope_reviewed`, `third_party_conditions_reviewed`, `notices_and_corresponding_source_reviewed`, and `exceptions_reviewed`, each explicitly `true`.

All input JSON is bounded and rejects duplicate keys. Candidate assets are copied through checked descriptors to private temporary storage, then validated without importing or extracting candidate code. Missing/extra assets, links, hash changes, malformed records and unknown fields fail. No credentials, network call, key operation or external publication is involved.

## Verification and remaining integration

First incorporate the owner's actual LICENSE/NOTICE/source decisions into newly reviewed source and distribution materials, then build/freeze a new candidate using the normal source-bound pipeline. The owner reviews its final exact bytes before supplying the detached decision. Do not relabel or replace the old 9ab candidate.

```sh
python3 scripts/verify_owner_legal_approval.py \
  --directory "$FINAL_CANDIDATE_DIRECTORY" \
  --index-sha256 "$INDEPENDENT_CANDIDATE_INDEX_SHA256" \
  --source "$EXACT_SOURCE_SHA" --version "$EXACT_VERSION" \
  --approval "$EXTERNAL_OWNER_DECISION" \
  --approval-sha256 "$INDEPENDENT_OWNER_DECISION_SHA256" \
  --policy "$EXTERNAL_CURRENT_POLICY" \
  --policy-sha256 "$INDEPENDENT_CURRENT_POLICY_SHA256"
```

Keep the decision/policy/result outside the approved candidate directory. Adding the decision to its own indexed target creates a hash-reference cycle; adding any file invalidates the existing exact inventory. Distribute any future detached records through a separately reviewed, independently pinned evidence channel. This patch does not change the protected signing workflow or its accepted asset set.

A later release gate must invoke this verifier against the same pinned bytes and current external policy, alongside independent signature, runtime and fresh-install acceptance. A saved success JSON alone is not reusable authorization: content can change and approvals can expire or be revoked. Final launch approval and public release remain separate. The current producer's generic product-license text and actual future license/source packaging still require an owner-informed source review; this verifier cannot make contradictory or missing source metadata correct.

Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_owner_legal_approval.py -v`. Tests contain synthetic decisions only and cover the real CLI, unchanged bytes/status, wrong pins/source/version, revocation, authority mismatch, expiry during verification, missing review assertions/materials, archive-member pins, duplicate/oversized JSON, links, extras, and copy-time tampering. They do not establish a real owner approval or LCH02 acceptance.
