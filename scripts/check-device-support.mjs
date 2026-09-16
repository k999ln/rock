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

requireValue(
  matrix.schema === 'rockstaros-device-support/1',
  'schemaが違います',
);
requireValue(
  matrix.policy?.architecture === 'shared-core-plus-device-support-package',
  '共通Coreと機種別packageの境界が必要です',
);
const modes = ['native_os', 'gsi_experimental', 'client_only', 'unsupported'];
requireValue(
  JSON.stringify(matrix.policy?.deliveryModes) === JSON.stringify(modes),
  '対応区分の順序または内容が違います',
);
requireValue(
  Array.isArray(matrix.targets) && matrix.targets.length > 0,
  '対象台帳が空です',
);

const ids = new Set();
for (const target of matrix.targets) {
  requireValue(
    typeof target.id === 'string' && target.id.length > 0,
    '対象IDが必要です',
  );
  requireValue(!ids.has(target.id), `${target.id}: 対象IDが重複しています`);
  ids.add(target.id);
  requireValue(
    modes.includes(target.deliveryMode),
    `${target.id}: 対応区分が不正です`,
  );
  requireValue(
    typeof target.status === 'string' && target.status.length > 0,
    `${target.id}: 状態が必要です`,
  );
  requireValue(
    target.flashReady === false,
    `${target.id}: 実機flash合格の証拠がありません`,
  );
  if (target.physicalDevice && target.exactModelRequired) {
    requireValue(
      Object.hasOwn(target, 'confirmedSku'),
      `${target.id}: SKU確認欄が必要です`,
    );
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
const pixel7 = byId('pixel-7-panther');
requireValue(
  pixel7?.confirmedSku === null,
  'pixel-7-panther: SKU確認は未実施です',
);
requireValue(
  pixel7?.status === 'DEFERRED_AFTER_PIXEL_10_SELECTION',
  'pixel-7-panther: Pixel 10受入前は保留です',
);
const pixel10 = byId('pixel-10-frankel');
requireValue(
  pixel10?.confirmedSku === 'GL066',
  'pixel-10-frankel: 実機readbackで確定したSKUが必要です',
);
requireValue(
  pixel10?.status === 'SELECTED_FIRST_PHYSICAL_TARGET_READBACK_CONFIRMED',
  'pixel-10-frankel: 最初の実機対象のreadback確定状態が必要です',
);

console.log(
  `端末対応: ${matrix.targets.length}対象、共通Core＋機種別package、4対応区分、実機flash 0件を確認`,
);
