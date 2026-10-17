# Sky live free-Cloud compatibility overlay

Target is `appgprj_6abdfad4c5648191bcae957913bd02fa` / https://avoado.si, not the root manifest's Columbia Site. Base live source: `a28a9f4288c96cade94d1a4895ba4ffdd32b408b`, version 56.

Keep live `0000_sky_service_bootstrap` and `0001_csv_trial_payments` unchanged. The appended migration creates only missing work storage and sandbox contract tables; `sky_library_items` already exists live despite the older snapshot, so its creation/index are idempotent. Snapshot/journal are retained in the corresponding Sites source commit. No old rows are updated or deleted. The free path uses the read-only `sky-recurring-plan` projection and does not deploy the paid collection adapter, scheduler, or dispatch triggers.

Shared source: `sky-free-cloud`, `sky-free-cloud-http`, `sky-model-selection`, `sky-model-routing`, `sky-recurring-plan`, `sky-free-cloud-sandbox`, free-Cloud panel/account UI and account route. Preserve the live gateway `remote-ai-guard` and 4-argument scope checks; main uses the existing device/passkey guard and 6-argument checks. Port only the free template/type into the older live workflow. Preserve the existing live domain router and other routes. Source revisions and matching build archive are in `docs/evidence/sky-free-cloud-live.json`.

Backup: bounded complete read of all 50 live tables / 144 rows stored privately outside Git; SQLite row reconstruction and pre/post additive-migration comparison passed. This is not an atomic physical D1 backup. A subsequent complete live read confirmed all existing rows unchanged before account testing. Account tests may append only their rate-limit, contract and work rows.

Rollback: disable `SKY_FREE_CLOUD_ENABLED` and `SKY_FREE_CLOUD_SANDBOX_SETUP`, then redeploy saved version 56 (`appgprj_6abdfad4c5648191bcae957913bd02fa~appgver_8b5cd6e593b881919f21c317abdcd4a6`). Keep additive tables in place; do not drop or overwrite live data. Never reapply older SQL manually. Test grants expire after one hour and enrollment cannot renew or replace an existing contract. Production billing is not enabled by this overlay.
