import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const audit = JSON.parse(
  readFileSync(resolve(root, 'data/system-composition-audit.json'), 'utf8'),
);
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};

fail(
  audit.schema === 'avocadoos-system-composition-audit/1',
  '構成監査schemaが不正です',
);
fail(/^\d{4}-\d{2}-\d{2}$/.test(audit.updatedAt), '構成監査の更新日が不正です');
fail(audit.verdict?.designAligned === true, '選択構成の設計適合判定が必要です');
fail(
  audit.verdict?.bestCurrentCombinationForDeclaredV1Objective === true,
  '宣言済み1.0目的に対する選択判定が必要です',
);
for (const key of [
  'allComponentsImplemented',
  'allRequiredConnectionsVerified',
  'productionReady',
]) {
  fail(audit.verdict?.[key] === false, `${key}を未完了として保持してください`);
}

const requiredCombination = [
  'identity',
  'device_architecture',
  'user_experience',
  'android_security_boundary',
  'local_ai',
  'tool_runtime',
  'verified_economics',
  'wallet_and_fund',
  'operator_access',
  'update_restore',
  'game_extension',
];
fail(
  JSON.stringify(audit.fixedCombination.map((item) => item.id)) ===
    JSON.stringify(requiredCombination),
  '全体構成の必須層・順序が変わっています',
);
for (const item of audit.fixedCombination) {
  fail(item.fit === 'ALIGNED', `${item.id}: 設計適合を明示してください`);
  fail(
    item.state && item.state !== 'PRODUCTION_READY',
    `${item.id}: 到達状態が不正です`,
  );
  fail(item.evidence.length > 0, `${item.id}: 証拠が必要です`);
  for (const path of item.evidence)
    fail(
      existsSync(resolve(root, path)),
      `${item.id}: 証拠が存在しません: ${path}`,
    );
}

const requiredFlows = [
  'offline_ai_team',
  'verified_income_wallet',
  'autonomous_fund',
  'safe_device_lifecycle',
  'emergency_support',
  'game',
];
fail(
  JSON.stringify(audit.endToEndFlows.map((flow) => flow.id)) ===
    JSON.stringify(requiredFlows),
  '全体flowの必須範囲・順序が変わっています',
);
for (const flow of audit.endToEndFlows) {
  fail(flow.path.length >= 3, `${flow.id}: 経路を明示してください`);
  fail(
    flow.state && !flow.state.includes('PRODUCTION_READY'),
    `${flow.id}: 未実証範囲を保持してください`,
  );
  fail(flow.blockingGaps.length > 0, `${flow.id}: 未接続点が必要です`);
}
for (const path of audit.authoritativeEvidence)
  fail(existsSync(resolve(root, path)), `正本が存在しません: ${path}`);
fail(
  audit.activeContradictions.length === 0,
  'activeContradictionsを解消してから適合を主張してください',
);
fail(
  audit.priorityOrder.length === 8,
  '目的から逆算した8段階の順序を保持してください',
);

console.log(
  `全体構成監査: ${audit.fixedCombination.length}層 / ${audit.endToEndFlows.length}経路 / 設計適合・統合未完了・production未完了`,
);
