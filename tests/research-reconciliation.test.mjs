import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const load = (p) =>
  JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const audit = load('data/rockstaros-research-reconciliation.json');
void test('Research reconciliation covers every baseline requirement plus later obligations without invented completion', () => {
  const baseline = load('data/product-baseline.json');
  const ids = audit.requirements.map((r) => r.id);
  assert.equal(ids.length, baseline.requirements.length + 38);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    ids.filter((id) => id.startsWith('RQ')),
    baseline.requirements,
  );
  for (const row of audit.requirements) {
    for (const field of [
      'title',
      'existing',
      'missing',
      'priority',
      'responsibility',
      'acceptance',
    ])
      assert.ok(row[field], row.id + ':' + field);
    assert.ok(
      existsSync(new URL('../' + row.existing, import.meta.url)),
      row.existing,
    );
  }
  assert.equal(audit.research.completed, false);
  assert.equal(audit.research.recordedWorkingMinutes, 840);
  assert.equal(audit.research.requestedWorkingMinutes, 900);
  assert.equal(audit.research.files.length, 40);
  for (const item of audit.research.files)
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
});
