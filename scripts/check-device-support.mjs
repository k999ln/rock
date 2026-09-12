import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const matrix = JSON.parse(
  readFileSync(resolve(root, 'data/device-support-matrix.json'), 'utf8'),
);

const requireValue = (condition, message) => {
  if (!condition) throw new Error(`device-support: ${message}`);
};

requireValue(matrix.schema === 'rockstaros-device-support/1', 'schemaが違います');
requireValue(
  matrix.policy?.architecture === 'shared-core-plus-device-support-package',
  '共通Coreと機種別packageの境界が必要です',
);
const modes = ['native_os', 'gsi_experimental', 'client_only', 'unsupported'];
requireValue(
  JSON.stringify(matrix.policy?.deliveryModes) === JSON.stringify(modes),
  '対応区分の順序または内容が違います',
);
requireValue(Array.isArray(matrix.targets) && matrix.targets.length > 0, '対象台帳が空です');

const ids = new Set();
for (const target of matrix.targets) {
  requireValue(typeof target.id === 'string' && target.id.length > 0, '対象IDが必要です');
  requireValue(!ids.has(target.id), `${target.id}: 対象IDが重複しています`);
  ids.add(target.id);
  requireValue(modes.includes(target.deliveryMode), `${target.id}: 対応区分が不正です`);
  requireValue(typeof target.status === 'string' && target.status.length > 0, `${target.id}: 状態が必要です`);
  requireValue(target.flashReady === false, `${target.id}: 実機flash合格の証拠がありません`);
  if (target.physicalDevice && target.exactModelRequired) {
    requireValue(Object.hasOwn(target, 'confirmedSku'), `${target.id}: SKU確認欄が必要です`);
  }
}

const byId = (id) => matrix.targets.find((target) => target.id === id);
requireValue(
  byId('blackberry-legacy')?.deliveryMode === 'unsupported',
  '旧BlackBerryを対応済みにできません',
);
requireValue(
  byId('apple-ios-ipados')?.deliveryMode === 'client_only',
  'Apple mobile端末はOS置換ではなくclientです',
);
for (const id of ['pixel-7-panther', 'pixel-10-frankel']) {
  const target = byId(id);
  requireValue(target?.confirmedSku === null, `${id}: 所有者によるSKU確認は未実施です`);
  requireValue(target?.status.includes('NOT_CONFIRMED'), `${id}: 未確認状態を保持してください`);
}

console.log(
  `端末対応: ${matrix.targets.length}対象、共通Core＋機種別package、4対応区分、実機flash 0件を確認`,
);
