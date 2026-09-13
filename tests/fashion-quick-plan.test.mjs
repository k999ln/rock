import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFashionQuickPlan } from '../lib/fashion-quick-plan.ts';

await test('fashion quick plan creates an immediately usable safe draft', () => {
  const plan = buildFashionQuickPlan({
    brandDirection: '静かで無機質な高級感。完全受注生産。海外にも販売する。',
    productDesign: 'ウールのワイドスラックス、黒、立体的なタック',
    region: '日本・海外',
  });

  assert.match(plan.audience, /25〜40歳/);
  assert.match(plan.market, /日本語と英語/);
  assert.match(plan.caption, /ウールのワイドスラックス/);
  assert.match(plan.campaignTitle, /静かな輪郭/);
  assert.equal(plan.contentWeek.length, 4);
  assert.equal(plan.producerFlow.length, 4);
  assert.deepEqual(plan.decisionsNeeded, ['販売価格', '公開日', '受注上限']);
  assert.match(plan.approvalBoundary, /実行しません/);
  assert.equal(plan.orderFields.length, 6);
});

await test('fashion quick plan rejects missing required input', () => {
  assert.throws(
    () =>
      buildFashionQuickPlan({
        brandDirection: '',
        productDesign: 'ジャケット',
      }),
    /ブランド方針/,
  );
});
