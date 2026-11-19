import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { releaseRuntimeFixture } from './noah-release-runtime-fixture.mjs';
import {
  createNoahLaunchService,
  createNoahLaunchApi,
} from '../../lib/noah-launch.ts';
import { createNoahPublisherApi } from '../../lib/noah-publisher.ts';
import { createNoahReviewApi } from '../../lib/noah-launch-review.ts';
import { ownerScopeFor } from '../../lib/owner-intent.ts';
import { SKY_REVIEW_CHECKS } from '../../lib/sky-tool-review.ts';

export const buyer = 'buyer-fixture',
  reviewer = 'reviewer-fixture',
  origin = 'https://avoado.si';
export const credential = 'rock_session_' + 'x'.repeat(43),
  bootId = randomUUID();
export const execution = { image: 'sha256:' + 'a'.repeat(64) };
export const outcome = { text: 'Synthetic result', files: [], exitCode: 0 };
export async function launchFixture(t, options = {}) {
  const f = await releaseRuntimeFixture({ pricing: 'free', ...options });
  t.after(f.close);
  for (const name of ['0038_noah_instances.sql', '0043_noah_runner.sql'])
    f.sqlite.exec(
      readFileSync(new URL('../../drizzle/' + name, import.meta.url), 'utf8'),
    );
  let now = Date.now();
  const deps = { ...f.deps, now: () => now };
  const service = createNoahLaunchService(deps),
    api = createNoahLaunchApi(deps),
    review = createNoahReviewApi({
      ...deps,
      reviewers: [reviewer, 'author-fixture'],
    });
  const body = {
    packageKey: f.p.packageKey,
    manifestSha256: f.p.manifestSha256,
    decision: 'verified',
    sourceRevision: f.hash,
    sourceSha256: f.hash,
    checks: Object.fromEntries(SKY_REVIEW_CHECKS.map((k) => [k, true])),
    evidenceUrls: ['https://example.com/synthetic-only'],
    notes: 'Synthetic local test, not a production approval.',
    expiresAt: now + 2 * 86400000,
  };
  const post = async (owner, body, path = '/api/noah/review') =>
    new Request(origin + path, {
      method: 'POST',
      headers: {
        'test-owner': owner,
        'Content-Type': 'application/json',
        Origin: origin,
        'X-Rock-Owner-Scope': await ownerScopeFor(owner),
      },
      body: JSON.stringify(body),
    });
  const submitted = await createNoahPublisherApi(deps).transition(
    await post(
      'author-fixture',
      {
        action: 'submit',
        packageKey: f.p.packageKey,
        manifestSha256: f.p.manifestSha256,
        status: 'submitted',
      },
      '/api/noah/publisher',
    ),
  );
  assert.equal(submitted.status, 200);
  const approved = async () => review(await post(reviewer, body));
  const enrolled = await service.enroll(buyer, credential, {
      bootId,
      name: 'Synthetic Mac',
      platform: 'darwin-arm64',
    }),
    base = { deviceId: enrolled.device.id, bootId };
  const enqueue = (values) =>
    service.enqueue(buyer, {
      id: randomUUID(),
      deviceId: base.deviceId,
      ...values,
    });
  const poll = () => service.poll(buyer, credential, base);
  const finish = (c, values) =>
    service.finish(buyer, credential, {
      ...base,
      id: c.id,
      lease: c.lease,
      ...values,
    });
  const connect = async () => {
    await enqueue({
      action: 'connect',
      agentId: 'release-' + f.p.manifestSha256,
    });
    const { command: c } = await poll();
    await finish(c, { state: 'succeeded', execution });
    return c;
  };
  return {
    ...f,
    service,
    api,
    review,
    approved,
    body,
    post,
    base,
    enqueue,
    poll,
    finish,
    connect,
    advance: (ms) => {
      now += ms;
    },
  };
}
