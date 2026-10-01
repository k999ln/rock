# Frozen rc2 D4 acceptance on an independent Linux host

This runner verifies native source b7d819cd291b653d165aa124f25a52b9898bfb2e and the unchanged rc2 candidate. It runs the existing 41-boot matrix once and preserves both successful and failed raw evidence. It does not publish a release, select a license, or perform managed signing.

The reviewed inputs are in `launch-plan.json`; its SHA256 is pinned inside the runner. Candidate Draft386933271 must contain exactly its eight pinned assets. Only the separate private evidence Draft387142563 can receive uploads. Each raw archive chunk is fetched back and checked after upload. Keep the evidence Draft private. A later execution needs a new review and fresh empty evidence destination; do not reuse an already populated Draft or replace assets.

The workflow uses a separate UID and clean environment for native execution. GitHub credentials are supplied only to transport steps. It checks available capacity after dependency setup and again after extraction; the earlier capacity-only run is not reused as proof for another host. The original native matrix and deadlines remain unchanged. The outer job reserves time for preserving partial evidence. Hard cancellation or runner loss can still prevent preservation and must remain an incomplete result.

Before dispatch, the exact copied admission/transport tests passed all22 cases on Linux, including real GNU sparse serialization, and independent review found no required fixes in the final version. These fixture results do not count as D4 acceptance. To rerun the fixture checks from this directory:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v test_ci_admission.py test_ci_transport.py
```

The workflow triggers only when its own file or this directory changes on the candidate branch. Track actual status and original evidence in `docs/rc2-remaining-acceptance-20260911.md`.
