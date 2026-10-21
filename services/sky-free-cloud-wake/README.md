# Sky free Cloud wake worker

The Site owns prompts, consent, identity, jobs, plan gates and results. This dedicated scheduled Worker sends only a signed empty wake request once per minute. It has no HTTP route, prompt access, model key or billing key. Existing Cloudflare account; no paid-plan upgrade was performed. Account billing-plan lookup was unavailable, so free account status is not claimed.

Deploy from the repository root using `npx wrangler deploy --config services/sky-free-cloud-wake/wrangler.jsonc`. Generate a random >=32-character secret outside Git; install SKY_FREE_CLOUD_WAKE_KEY with Wrangler secret bulk and set the identical secret via Sites runtime environment tools. Set SKY_FREE_CLOUD_BACKGROUND_ENABLED=true on the Site, preserving every other key, then deploy the matching saved Site version. Never put the key in hosting.json, source, logs or evidence.

Only confirmed pre-generation FREE_LIMIT is retryable. Maximum five attempts / ten minutes, one eligible job per minute, CAS before every send, uncertain work never resubmitted. Existing enabled owner / service access / monthly Sandbox plan and cap gates apply. Browser GET history never executes work. No production billing or paid LLM fallback.

To pause, set SKY_FREE_CLOUD_BACKGROUND_ENABLED=false in Sites runtime and redeploy its current saved version; stop the dedicated cron via wrangler configuration if needed. Queued work remains stored and expires; completed results remain readable. Re-enabling never revives cancelled/uncertain/expired work. If a sending job loses its worker, inspect provider/job evidence manually; do not reset it to queued. Rotate the shared wake secret in both runtimes together. HMAC timestamps expire after two minutes; duplicate wakes still use the same WorkJob CAS.

Acceptance separates fake-provider concurrency tests from authenticated real-provider tab-close/revisit evidence. See docs/evidence/sky-free-cloud-background.json. Current deployment is owner-limited and best effort, not unlimited multi-user queue throughput.
