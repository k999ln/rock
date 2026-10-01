import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

void test('whole-system composition audit passes and preserves honest boundaries', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-system-composition.mjs'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /12層 \/ 7経路/);
  assert.match(result.stdout, /統合未完了/);
});

void test('whole-system composition audit retains the completed reboot evidence and separate release gates', async () => {
  const audit = (
    await import('../data/system-composition-audit.json', {
      with: { type: 'json' },
    })
  ).default;
  const offline = audit.endToEndFlows.find(
    (flow) => flow.id === 'offline_ai_team',
  );
  assert.equal(
    offline.state,
    'FIRST_PURE_TOOL_PHYSICAL_REBOOT_VERIFIED_GENERAL_AGENT_RUNTIME_PENDING',
  );
  assert.equal(offline.requiredForV1, true);
  const income = audit.endToEndFlows.find(
    (flow) => flow.id === 'verified_income_wallet',
  );
  assert.equal(income.requiredForV1, false);
  assert.equal(income.requiredForEarningsRelease, true);
  const material = audit.endToEndFlows.find(
    (flow) => flow.id === 'material_invention',
  );
  assert.equal(material.requiredForV1, false);
  assert.equal(material.requiredForMaterialInventionRelease, true);
  assert.match(material.state, /INTEGRATED_DESIGN_COMPLETE/);
  assert.equal(audit.priorityOrder[4].includes('full build'), true);
  assert.equal(audit.verdict.productionReady, false);
});
