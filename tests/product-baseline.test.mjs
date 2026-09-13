import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, validateBaseline } from '../scripts/check-product-baseline.mjs';

const source = JSON.parse(
  readFileSync(resolve(root, 'data/product-baseline.json'), 'utf8'),
);
void test('product baseline rejects lost requirements, stale-as-live claims and mismatched source evidence', () => {
  assert.equal(validateBaseline(source).repository, 'k999ln/rock');
  const missing = structuredClone(source);
  missing.requirements.pop();
  assert.throws(() => validateBaseline(missing), /RQ01〜RQ29/);
  const missingOperationalBase = structuredClone(source);
  missingOperationalBase.requirements.splice(11, 1);
  assert.throws(() => validateBaseline(missingOperationalBase), /RQ01〜RQ29/);
  const fixedFundCount = structuredClone(source);
  fixedFundCount.automationFunds.fundCountLimit = 4;
  assert.throws(() => validateBaseline(fixedFundCount), /ファンド数/);
  const retainedCommission = structuredClone(source);
  retainedCommission.automationFunds.performanceCommissionBps = 1;
  assert.throws(() => validateBaseline(retainedCommission), /100%利用者/);
  const missingTemplate = structuredClone(source);
  delete missingTemplate.acceptanceTemplate;
  assert.throws(() => validateBaseline(missingTemplate), /acceptanceTemplate/);
  const missingDesign = structuredClone(source);
  delete missingDesign.designReview;
  assert.throws(() => validateBaseline(missingDesign), /designReview/);
  const hiddenFee = structuredClone(source);
  hiddenFee.atmFees.rockFeeMinor = 1;
  assert.throws(() => validateBaseline(hiddenFee), /手数料は0/);
  const upfront = structuredClone(source);
  upfront.skyMonthlyBilling.upfrontChargeEnabled = true;
  assert.throws(() => validateBaseline(upfront), /先払い月額/);
  const debt = structuredClone(source);
  debt.skyEarningsSettlement.debtCarryForward = true;
  assert.throws(() => validateBaseline(debt), /収益連動精算/);
  const fakeMercariRevenue = structuredClone(source);
  fakeMercariRevenue.mercariRevenueLoop.manualSalesAreVerified = true;
  assert.throws(() => validateBaseline(fakeMercariRevenue), /メルカリ個人版/);
  const atmDependency = structuredClone(source);
  atmDependency.gameExchange.atmDependency = true;
  assert.throws(() => validateBaseline(atmDependency), /ATM必須/);
  const unapprovedMarket = structuredClone(source);
  unapprovedMarket.marketExploration.appShellAuthorized = false;
  assert.throws(() => validateBaseline(unapprovedMarket), /基本アプリ枠/);
  const missingHome = structuredClone(source);
  delete missingHome.homeExperience;
  assert.throws(() => validateBaseline(missingHome), /ホームと設定アプリ/);
  const missingMaintenance = structuredClone(source);
  delete missingMaintenance.systemMaintenance;
  assert.throws(() => validateBaseline(missingMaintenance), /システム診断/);
  const live = structuredClone(source);
  live.auditInputs.isLiveStatus = true;
  assert.throws(() => validateBaseline(live), /snapshot/);
  const mismatch = structuredClone(source);
  mismatch.auditInputs.nativeHead = 'a'.repeat(40);
  assert.throws(() => validateBaseline(mismatch), /SHA/);
  const missingReview = structuredClone(source);
  delete missingReview.auditInputs.designHead;
  assert.throws(() => validateBaseline(missingReview), /designHead/);
  const unauthorizedRuntime = structuredClone(source);
  unauthorizedRuntime.marketExploration.runtimeAuthorized = true;
  assert.throws(() => validateBaseline(unauthorizedRuntime), /未承認/);
  const fakeLocalMcp = structuredClone(source);
  fakeLocalMcp.skyNetworkEconomy.localMcpConnection.realSessionStateDisplayed = false;
  assert.throws(() => validateBaseline(fakeLocalMcp), /ローカルMCP/);
  const fakeExternalMcp = structuredClone(source);
  fakeExternalMcp.skyNetworkEconomy.connectionTargets.externalOneTapEnabled = true;
  assert.throws(() => validateBaseline(fakeExternalMcp), /MCP接続先/);
  const fakeConnector = structuredClone(source);
  fakeConnector.skyNetworkEconomy.multiMcpConnector.skyUiConnected = false;
  assert.throws(() => validateBaseline(fakeConnector), /複数MCP Connector/);
  const escaped = structuredClone(source);
  escaped.authority = '../external.md';
  assert.throws(() => validateBaseline(escaped), /repository外/);
  assert.throws(
    () =>
      validateBaseline(source, (path) =>
        path.endsWith('AGENTS.md')
          ? 'missing links'
          : readFileSync(path, 'utf8'),
      ),
    /AGENTS/,
  );
});
