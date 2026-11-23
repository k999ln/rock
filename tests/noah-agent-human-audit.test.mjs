import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  prepareAudit,
  scoreAudit,
} from '../scripts/noah-agent-human-audit.mjs';

function corpus() {
  const families = [],
    candidates = [],
    checks = [];
  for (let i = 0; i < 8; i++) {
    const familyId = `family-${i}`,
      candidateId = `candidate-${i}`;
    families.push({
      id: familyId,
      representative_id: candidateId,
      members: 1,
      listed: i % 2,
      level: i % 3,
    });
    candidates.push({
      id: candidateId,
      family_id: familyId,
      name: `Agent ${i}`,
      summary: `source description ${i}`,
      summary_ja: i % 2 ? null : `説明 ${i}`,
      record_sha256: `${String(i).repeat(64)}`,
      record_json: '{}',
      state: 'active',
      reason: null,
    });
    checks.push({
      candidate_id: candidateId,
      tools_sha256: `${String(i + 1).repeat(64)}`,
      tool_count: 1,
      form_tools: 1,
      one_tap_tools: 0,
    });
  }
  return { schema: 'noah-intake-import/1', families, candidates, checks };
}

function definitions() {
  return {
    schema: 'noah-label-export/1',
    series: Array.from({ length: 8 }, (_, i) => ({
      familyId: `family-${i}`,
      candidateId: `candidate-${i}`,
      toolsSha256: `${String(i + 1).repeat(64)}`,
      tools: [
        {
          name: `tool-${i}`,
          description: `tool definition ${i}`,
          inputSchema: { type: 'object' },
        },
      ],
    })),
  };
}

function tempCorpus(t) {
  const dir = mkdtempSync(join(tmpdir(), 'noah-human-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'import.json'),
    definitionsPath = join(dir, 'labels.json');
  writeFileSync(path, JSON.stringify(corpus()));
  writeFileSync(definitionsPath, JSON.stringify(definitions()));
  return { path, definitionsPath };
}

void test('human audit preparation is deterministic and includes unlabeled/unlisted families', (t) => {
  const { path, definitionsPath } = tempCorpus(t),
    first = prepareAudit({
      corpusPath: path,
      definitionsPath,
      seed: 'test-seed',
      sampleSize: 8,
    }),
    second = prepareAudit({
      corpusPath: path,
      definitionsPath,
      seed: 'test-seed',
      sampleSize: 8,
    });
  assert.deepEqual(first.selection, second.selection);
  assert.equal(first.population.total, 8);
  assert.equal(first.population.included, 8);
  assert.equal(first.population.excluded, 0);
  assert.equal(first.population.includesUnlabeled, true);
  assert.deepEqual(
    new Set(first.items.map((item) => item.familyId)),
    new Set(corpus().families.map((family) => family.id)),
  );
  assert.ok(first.items.some((item) => item.summaryJa === null));
  assert.ok(
    first.items.every((item) => item.definitionEvidenceIds.length === 1),
  );
  assert.throws(
    () => prepareAudit({ corpusPath: path }),
    /audit_population_too_small/,
  );
});

void test('score claims only after complete evidence-backed judgments and matching source hash', (t) => {
  const { path, definitionsPath } = tempCorpus(t),
    manifest = prepareAudit({
      corpusPath: path,
      definitionsPath,
      seed: 'test-score',
      sampleSize: 8,
    });
  const judgments = {
    schema: 'noah-agent-human-audit/1',
    judgments: manifest.items.map((item) => ({
      auditId: item.auditId,
      judgment: 'match',
      sourceEvidenceIds: item.evidenceIds,
      definitionEvidenceIds: item.definitionEvidenceIds,
      outputEvidenceIds: [`sha256:${'a'.repeat(64)}`],
      note: 'reviewed',
    })),
  };
  const pass = scoreAudit({
    manifest,
    judgments,
    sourceStatus: 'verified',
    definitionsStatus: 'verified',
  });
  assert.equal(pass.claim, 'pass_95_percent');
  assert.equal(pass.counts.match, 8);
  assert.equal(pass.counts.invalid, 0);
  const incomplete = scoreAudit({
    manifest,
    judgments: { judgments: judgments.judgments.slice(0, 7) },
    sourceStatus: 'verified',
    definitionsStatus: 'verified',
  });
  assert.equal(incomplete.claim, 'not_claimed');
  assert.equal(incomplete.counts.unreviewed, 1);
  const bad = scoreAudit({
    manifest,
    judgments: {
      judgments: [
        { ...judgments.judgments[0], sourceEvidenceIds: ['made-up'] },
      ],
    },
    sourceStatus: 'verified',
    definitionsStatus: 'verified',
  });
  assert.equal(bad.claim, 'not_claimed');
  assert.ok(bad.counts.invalid > 0);
  const sourceUnavailable = scoreAudit({
    manifest,
    judgments,
    sourceStatus: 'unavailable',
    definitionsStatus: 'verified',
  });
  assert.equal(sourceUnavailable.claim, 'not_claimed');
  assert.equal(
    JSON.parse(readFileSync(path, 'utf8')).families.length,
    8,
    'scoring does not mutate the source corpus',
  );
});

void test('a sample without an exact tool definition cannot be marked match', (t) => {
  const { path } = tempCorpus(t),
    manifest = prepareAudit({
      corpusPath: path,
      seed: 'missing-definition',
      sampleSize: 8,
    });
  const judgments = manifest.items.map((item) => ({
    auditId: item.auditId,
    judgment: 'match',
    sourceEvidenceIds: item.evidenceIds,
    definitionEvidenceIds: [],
    outputEvidenceIds: ['sha256:' + 'b'.repeat(64)],
  }));
  const report = scoreAudit({ manifest, judgments, sourceStatus: 'verified' });
  assert.equal(report.claim, 'not_claimed');
  assert.ok(report.counts.invalid >= 8);
  const mismatches = scoreAudit({
    manifest,
    judgments: {
      judgments: judgments.map((row) => ({ ...row, judgment: 'mismatch' })),
    },
    sourceStatus: 'verified',
  });
  assert.equal(mismatches.counts.mismatch, 8);
  assert.equal(mismatches.counts.invalid, 0);
});
