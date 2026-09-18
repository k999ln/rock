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
  assert.throws(() => validateBaseline(missing), /RQ01〜RQ49/);
  const missingOperationalBase = structuredClone(source);
  missingOperationalBase.requirements.splice(11, 1);
  assert.throws(() => validateBaseline(missingOperationalBase), /RQ01〜RQ49/);
  const unsafeMaterialExecution = structuredClone(source);
  unsafeMaterialExecution.materialInvention.autonomousPhysicalExperimentAllowed = true;
  assert.throws(
    () => validateBaseline(unsafeMaterialExecution),
    /Material Invention Core/,
  );
  const falseProductCompletion = structuredClone(source);
  falseProductCompletion.materialInvention.designStatus = 'product_complete';
  assert.throws(
    () => validateBaseline(falseProductCompletion),
    /Material Invention Core/,
  );
  const unsafeSpatialExecution = structuredClone(source);
  unsafeSpatialExecution.materialInvention.spatialDevelopment.physicalExecutionAllowed = true;
  assert.throws(
    () => validateBaseline(unsafeSpatialExecution),
    /Spatial Invention Studio/,
  );
  const renamedSpatialOs = structuredClone(source);
  renamedSpatialOs.materialInvention.spatialDevelopment.operatingSystem =
    'avocadoOS';
  assert.throws(
    () => validateBaseline(renamedSpatialOs),
    /Spatial Invention Studio/,
  );
  const automaticPatentFiling = structuredClone(source);
  automaticPatentFiling.materialInvention.spatialDevelopment.automaticPatentFilingAllowed = true;
  assert.throws(
    () => validateBaseline(automaticPatentFiling),
    /Spatial Invention Studio/,
  );
  const detachedSpatialExperience = structuredClone(source);
  detachedSpatialExperience.materialInvention.spatialDevelopment.relationshipToMaterialCore =
    'optional_extension';
  assert.throws(
    () => validateBaseline(detachedSpatialExperience),
    /Spatial Invention Studio/,
  );
  const osLosesCoreRole = structuredClone(source);
  osLosesCoreRole.northStar.osIsProductCore = false;
  assert.throws(() => validateBaseline(osLosesCoreRole), /AIネイティブOS Core/);
  const gameBakedIntoCore = structuredClone(source);
  gameBakedIntoCore.northStar.applicationReleaseIndependence = false;
  assert.throws(
    () => validateBaseline(gameBakedIntoCore),
    /AIネイティブOS Core/,
  );
  const incomeGuarantee = structuredClone(source);
  incomeGuarantee.northStar.monthlyIncomeTargetNature = 'guaranteed_income';
  assert.throws(() => validateBaseline(incomeGuarantee), /AIネイティブOS Core/);
  const blanketCollection = structuredClone(source);
  blanketCollection.northStar.dataCollection.categorySpecificConsentRequired = false;
  assert.throws(
    () => validateBaseline(blanketCollection),
    /AIネイティブOS Core/,
  );
  const lostLocalAiBuildEvidence = structuredClone(source);
  lostLocalAiBuildEvidence.localAiRuntime.apkBuilt = false;
  assert.throws(
    () => validateBaseline(lostLocalAiBuildEvidence),
    /ローカルLLM/,
  );
  const fakePlatformBuild = structuredClone(source);
  fakePlatformBuild.androidPlatformCore.aospImageBuilt = true;
  assert.throws(() => validateBaseline(fakePlatformBuild), /OS Platform Core/);
  const fakeCompositionCompletion = structuredClone(source);
  fakeCompositionCompletion.systemComposition.productionReady = true;
  assert.throws(
    () => validateBaseline(fakeCompositionCompletion),
    /全体構成監査/,
  );
  const prematurePaidFullBuild = structuredClone(source);
  prematurePaidFullBuild.androidPreFullBuildGate.paidFullBuildAllowed = true;
  assert.throws(() => validateBaseline(prematurePaidFullBuild), /full build前/);
  const skippedAndroidPreflight = structuredClone(source);
  skippedAndroidPreflight.androidPreFullBuildGate.checks.androidEmulatorIntegration =
    'passed';
  assert.throws(
    () => validateBaseline(skippedAndroidPreflight),
    /full build前/,
  );
  const fakeProviderAcceptance = structuredClone(source);
  fakeProviderAcceptance.androidPreFullBuildGate.checks.skyZemaToolWalletPath =
    'provider_sandbox_passed';
  assert.throws(() => validateBaseline(fakeProviderAcceptance), /full build前/);
  const noEmergencyOperator = structuredClone(source);
  noEmergencyOperator.deviceEmergencyAccess.singleOperatorActivation = false;
  assert.throws(() => validateBaseline(noEmergencyOperator), /緊急保護/);
  const emergencyRootShell = structuredClone(source);
  emergencyRootShell.deviceEmergencyAccess.rootShellAllowed = true;
  assert.throws(() => validateBaseline(emergencyRootShell), /緊急保護/);
  const fakeEmergencyImplementation = structuredClone(source);
  fakeEmergencyImplementation.deviceEmergencyAccess.androidServiceImplemented = false;
  assert.throws(
    () => validateBaseline(fakeEmergencyImplementation),
    /緊急保護/,
  );
  const fakePhysicalOperatorAcceptance = structuredClone(source);
  fakePhysicalOperatorAcceptance.deviceEmergencyAccess.androidDeviceOwnerExecutionVerified = true;
  assert.throws(
    () => validateBaseline(fakePhysicalOperatorAcceptance),
    /緊急保護/,
  );
  const missingOperatorConsole = structuredClone(source);
  missingOperatorConsole.deviceEmergencyAccess.operatorConsoleImplemented = false;
  assert.throws(() => validateBaseline(missingOperatorConsole), /緊急保護/);
  const consoleInsideUserOs = structuredClone(source);
  consoleInsideUserOs.deviceEmergencyAccess.includedInUserOs = true;
  assert.throws(() => validateBaseline(consoleInsideUserOs), /緊急保護/);
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
  assert.throws(() => validateBaseline(unapprovedMarket), /PAPER runtime/);
  const missingBotControl = structuredClone(source);
  delete missingBotControl.chatInteraction.connectedMcpPresentation;
  assert.throws(() => validateBaseline(missingBotControl), /Zema/);
  const oldDisplayName = structuredClone(source);
  oldDisplayName.chatInteraction.displayName = 'Chat';
  assert.throws(() => validateBaseline(oldDisplayName), /Zema/);
  const unsafeHandoff = structuredClone(source);
  unsafeHandoff.chatInteraction.skyHandoff.requestInUrl = true;
  assert.throws(() => validateBaseline(unsafeHandoff), /Zema/);
  const fakeLiveProgress = structuredClone(source);
  fakeLiveProgress.chatInteraction.liveProgress.fabricatedProgressAllowed = true;
  assert.throws(() => validateBaseline(fakeLiveProgress), /接続bot管理/);
  const splitWebDelivery = structuredClone(source);
  splitWebDelivery.webDeliveryIntegrity.sourceAndPrivateSiteCommitMustMatch = false;
  assert.throws(() => validateBaseline(splitWebDelivery), /同一commit/);
  const missingHome = structuredClone(source);
  delete missingHome.homeExperience;
  assert.throws(() => validateBaseline(missingHome), /ホームと設定アプリ/);
  const missingMaintenance = structuredClone(source);
  delete missingMaintenance.systemMaintenance;
  assert.throws(() => validateBaseline(missingMaintenance), /OS運用/);
  const fakeReleaseReview = structuredClone(source);
  fakeReleaseReview.systemMaintenance.releaseReadiness.androidCompatibility =
    'passed';
  assert.throws(() => validateBaseline(fakeReleaseReview), /公開審査/);
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
  unauthorizedRuntime.marketExploration.liveRuntimeAuthorized = true;
  assert.throws(() => validateBaseline(unauthorizedRuntime), /外部接続/);
  const custodialRock = structuredClone(source);
  custodialRock.externalFinancialProviderBoundary.providerDirectLedgerWrite = true;
  assert.throws(() => validateBaseline(custodialRock), /外部Provider/);
  const fakeLiveProvider = structuredClone(source);
  fakeLiveProvider.externalFinancialProviderBoundary.liveProvidersConnected = true;
  assert.throws(() => validateBaseline(fakeLiveProvider), /外部Provider/);
  const custodialRockWallet = structuredClone(source);
  custodialRockWallet.firstPartySettlementProvider.userFundsCustodied = true;
  assert.throws(
    () => validateBaseline(custodialRockWallet),
    /Rock Settlement Wallet/,
  );
  const liveRockCollection = structuredClone(source);
  liveRockCollection.firstPartySettlementProvider.liveCollectionEnabled = true;
  assert.throws(
    () => validateBaseline(liveRockCollection),
    /Rock Settlement Wallet/,
  );
  const custodialReceiveRail = structuredClone(source);
  custodialReceiveRail.productionReceiveRail.privateKeysStored = true;
  assert.throws(() => validateBaseline(custodialReceiveRail), /本番受取レール/);
  const automaticReceiveRail = structuredClone(source);
  automaticReceiveRail.productionReceiveRail.automaticTransferEnabled = true;
  assert.throws(() => validateBaseline(automaticReceiveRail), /本番受取レール/);
  const fakeFirstTransfer = structuredClone(source);
  fakeFirstTransfer.productionReceiveRail.firstLiveTransfer = 'verified';
  assert.throws(() => validateBaseline(fakeFirstTransfer), /本番受取レール/);
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
