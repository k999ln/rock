import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createWorkJob } from '../lib/workflow.ts';
import { buildSkyOwnerExport, SKY_OWNER_EXPORT_CSP, SKY_OWNER_EXPORT_MAX_BYTES } from '../lib/sky-owner-export.ts';

const jobId = 'a1111111-1111-4111-8111-111111111111';
const job = () => createWorkJob({ id: jobId, title: '自分の仕事', templateId: 'cloud-agent' });
function fixture() {
  return {
    job: job(), budget: null, reservations: [], cloud: [],
    agents: [{
      delegation: { id: 'delegation', state: 'remote_completed', revision: 3,
        targetAgentName: '議事録', targetAgentVersion: '1', targetOrigin: 'https://agent.example',
        artifactsCaptured: 1, createdAt: 1, updatedAt: 2,
        ownerUserId: 'not-exported-owner', authorizationSha256: 'not-exported-approval',
        priceQuote: { secret: 'not-exported-quote' }, brokerToken: 'not-exported-token' },
      artifacts: [{ id: 'artifact', sha256: 'a'.repeat(64), byteLength: 100, createdAt: 2,
        document: { schemaVersion: 1, artifacts: [{ name: '決定事項', textParts: ['自分の成果\r\n次の行'] }], omittedNonTextParts: 0, truncated: false } }],
      receipt: { providerId: 'provider', providerReference: 'receipt', currency: 'JPY', amountMinor: 12,
        issuedAt: 1, receivedAt: 2, receiptJson: 'not-exported-signed-receipt' },
    }],
  };
}
const decode = (value) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function file(html, name) {
  const match = html.match(new RegExp(`<pre data-export-file="${name.replaceAll('.', '\\.')}">([\\s\\S]*?)</pre>`));
  assert.ok(match, name);
  return decode(match[1]);
}

void test('one job exports readable text, bounded business records and a verifiable file manifest', async () => {
  const input = fixture();
  const before = structuredClone(input);
  const { html, manifest, filename } = await buildSkyOwnerExport(input, '2026-10-18T12:00:00Z');
  assert.deepEqual(input, before);
  assert.equal(manifest.completeness, 'complete_within_declared_scope');
  assert.equal(filename, `sky-work-${jobId}-r0.html`);
  assert.match(html, /自分の成果/);
  assert.match(html, /ログインなし/);
  assert.match(html, /12/);
  assert.doesNotMatch(html, /not-exported/);
  for (const entry of manifest.files) {
    const content = file(html, entry.name);
    assert.equal(Buffer.byteLength(content), entry.byteLength);
    assert.equal(createHash('sha256').update(content).digest('hex'), entry.sha256);
  }
  assert.equal(JSON.parse(file(html, 'work.json')).revision, 0);
  assert.match(file(html, 'results.md'), /自分の成果\n次の行/);
});

void test('untrusted titles, Agent output and Cloud text stay text in a script-free offline file', async () => {
  const input = fixture();
  input.job.title = '</title><script>fetch("https://evil.example")</script>';
  input.agents[0].artifacts[0].document.artifacts[0].textParts = ['</pre><img src="https://evil.example" onerror="alert(1)"> & <script>bad()</script>'];
  const { html } = await buildSkyOwnerExport(input);
  assert.doesNotMatch(html, /<script|<img|<iframe|<link|onerror="/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(SKY_OWNER_EXPORT_CSP, /default-src 'none'/);
  assert.match(SKY_OWNER_EXPORT_CSP, /form-action 'none'/);
});

void test('omitted attachments, truncated text and missing usage never become a complete export', async () => {
  const input = fixture();
  input.agents[0].artifacts[0].document.omittedNonTextParts = 2;
  input.agents[0].artifacts[0].document.truncated = true;
  input.agents[0].receipt = null;
  const { manifest } = await buildSkyOwnerExport(input);
  assert.equal(manifest.completeness, 'partial');
  assert.match(manifest.warnings.join(' '), /file\/data 2件/);
  assert.match(manifest.warnings.join(' '), /0円を意味しません/);
});

void test('saveResult=false cannot expose a body, and usage is not represented as a final invoice', async () => {
  const input = fixture();
  input.cloud = [{ id: 'cloud', revision: 1, state: 'unreconciled', saveResult: false,
    resultText: 'must-not-export-unsaved', quote: { ceiling: { modelId: 'fixture-model', providerId: 'fixture-provider', currency: 'USD' } },
    usage: { inputTokens: 2, outputTokens: 3, secret: 'must-not-export-usage-extra' }, settledMinor: null,
    approvalDigest: 'must-not-export-approval', verifiedRate: { secret: 'must-not-export-rate' },
    createdAt: 1, updatedAt: 2 }];
  const { html, manifest } = await buildSkyOwnerExport(input);
  assert.doesNotMatch(html, /must-not-export/);
  const cloud = JSON.parse(file(html, 'cloud-answers.json'))[0];
  assert.equal(cloud.resultText, null);
  assert.equal(cloud.settledMinor, null);
  assert.deepEqual(cloud.usage, { inputTokens: 2, outputTokens: 3 });
  assert.equal(manifest.completeness, 'partial');
});

void test('unknown artifact fields and over-limit data fail instead of silently omitting data', async () => {
  const input = fixture();
  input.agents[0].artifacts[0].document.credentials = 'private';
  await assert.rejects(buildSkyOwnerExport(input), { code: 'INVALID_ARTIFACT' });
  const large = fixture();
  large.job.plan.objective = 'x'.repeat(SKY_OWNER_EXPORT_MAX_BYTES + 1);
  await assert.rejects(buildSkyOwnerExport(large), { code: 'TOO_LARGE' });
});

void test('work history uses an allowlist and never transfers approval or execution fields', async () => {
  const input = fixture();
  input.job.events = [{ at: '2026-10-18', command: { id: 'event', action: 'complete', note: '本人のメモ', token: 'secret-event-token', approval: 'secret-approval' } }];
  const { html } = await buildSkyOwnerExport(input);
  assert.match(html, /本人のメモ/);
  assert.doesNotMatch(html, /secret-event|secret-approval/);
});
