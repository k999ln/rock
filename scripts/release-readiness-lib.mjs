import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const allowedGateStates = new Set(['pass', 'blocked', 'not_applicable']);
const allowedTargetStates = new Set(['ready', 'blocked']);

const fail = (message) => {
  throw new Error(`release-readiness: ${message}`);
};

const inside = (root, path) => {
  const candidate = resolve(root, path);
  return !isAbsolute(path) && !relative(root, candidate).startsWith('..');
};

export function deriveTargetStatus(target) {
  return target.gates.every(
    (gate) => !gate.required || gate.status === 'pass',
  )
    ? 'ready'
    : 'blocked';
}

export function packageEntries(lock) {
  return Object.entries(lock.packages || {})
    .filter(([path, value]) => path && value?.version)
    .map(([path, value]) => ({
      path,
      name: value.name || path.split('node_modules/').at(-1),
      ...value,
    }));
}

export function validateReleaseReadiness({ root, readiness, ownerIntent, lock }) {
  if (readiness.schema !== 'rockstaros-release-readiness/1') fail('schemaが違います');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readiness.evaluatedAt)) fail('評価日が必要です');
  if (!Array.isArray(readiness.targets) || readiness.targets.length < 5) fail('配布対象が不足しています');

  const targetIds = new Set();
  const requiredTargets = new Set([
    'web-pwa-owner-preview',
    'web-pwa-public-preview',
    'qemu-developer-preview',
    'android-physical-preview',
    'iphone-ipad-client',
    'personal-number-identity',
  ]);
  for (const target of readiness.targets) {
    if (!target.id || targetIds.has(target.id)) fail(`${target.id || 'unknown'}: 対象IDが不正です`);
    targetIds.add(target.id);
    if (!allowedTargetStates.has(target.declaredStatus)) fail(`${target.id}: 対象状態が不正です`);
    if (!Array.isArray(target.gates) || target.gates.length === 0) fail(`${target.id}: gateがありません`);
    const gateIds = new Set();
    for (const gate of target.gates) {
      if (!gate.id || gateIds.has(gate.id)) fail(`${target.id}: gate IDが不正です`);
      gateIds.add(gate.id);
      if (typeof gate.required !== 'boolean' || !allowedGateStates.has(gate.status)) {
        fail(`${target.id}/${gate.id}: gate状態が不正です`);
      }
      if (gate.status === 'not_applicable' && (!gate.reason || gate.required)) {
        fail(`${target.id}/${gate.id}: 適用外には理由が必要で、必須にはできません`);
      }
      if (gate.status === 'blocked' && !gate.ownerAction) {
        fail(`${target.id}/${gate.id}: 未達時の必要行動がありません`);
      }
      for (const evidence of gate.evidence || []) {
        if (!inside(root, evidence) || !existsSync(resolve(root, evidence))) {
          fail(`${target.id}/${gate.id}: 根拠がありません: ${evidence}`);
        }
      }
    }
    const derived = deriveTargetStatus(target);
    if (target.declaredStatus !== derived) fail(`${target.id}: 宣言${target.declaredStatus}と算出${derived}が不一致です`);
  }
  for (const id of requiredTargets) if (!targetIds.has(id)) fail(`${id}: 必須対象がありません`);

  const byId = (id) => readiness.targets.find((target) => target.id === id);
  const gate = (target, id) => byId(target)?.gates.find((item) => item.id === id);
  const licenseSelected = typeof ownerIntent.ownCodeIntent?.specificLicense === 'string';
  const licenseFileExists = existsSync(resolve(root, 'LICENSE')) || existsSync(resolve(root, 'LICENSE.md'));
  for (const target of ['web-pwa-public-preview', 'qemu-developer-preview']) {
    const productLicense = gate(target, 'product-license');
    if (productLicense?.status === 'pass' && (!licenseSelected || !licenseFileExists)) {
      fail(`${target}: 所有者選択とLICENSEなしに製品ライセンスを合格にできません`);
    }
  }
  const signingExecuted =
    ownerIntent.signing?.keyProvisioned === true &&
    !String(ownerIntent.signing?.status || '').includes('NOT_EXECUTED');
  for (const target of ['qemu-developer-preview', 'android-physical-preview']) {
    if (gate(target, 'production-signing')?.status === 'pass' && !signingExecuted) {
      fail(`${target}: 正式鍵と実施記録なしに署名を合格にできません`);
    }
  }
  if (byId('android-physical-preview').declaredStatus === 'ready') {
    fail('実機受入証拠のないAndroid物理端末を合格にできません');
  }
  if (gate('personal-number-identity', 'feature-disabled')?.status !== 'pass') {
    fail('マイナンバー機能は審査完了まで無効を維持してください');
  }

  const dependencies = packageEntries(lock);
  const missingLicense = dependencies.filter((entry) => !entry.license);
  if (missingLicense.length) fail(`依存${missingLicense.length}件にlicense表記がありません`);

  return {
    targetCount: readiness.targets.length,
    readyTargets: readiness.targets.filter((target) => target.declaredStatus === 'ready').map((target) => target.id),
    blockedTargets: readiness.targets.filter((target) => target.declaredStatus === 'blocked').map((target) => target.id),
    dependencyCount: dependencies.length,
    missingDependencyLicenses: missingLicense.length,
  };
}

export function createCycloneDxSbom({ root, lock, outputPath }) {
  const dependencies = packageEntries(lock);
  const componentMap = new Map();
  for (const entry of dependencies) {
    const purl = `pkg:npm/${encodeURIComponent(entry.name)}@${entry.version}`;
    const existing = componentMap.get(purl);
    if (existing) {
      existing.properties.push({ name: 'rockstaros:package-lock-path', value: entry.path });
      continue;
    }
    componentMap.set(purl, {
      type: 'library',
      'bom-ref': purl,
      name: entry.name,
      version: entry.version,
      purl,
      licenses: [{ license: { name: entry.license } }],
      properties: [{ name: 'rockstaros:package-lock-path', value: entry.path }],
    });
  }
  const components = [...componentMap.values()];
  const serialHash = createHash('sha256')
    .update(JSON.stringify(components.map(({ purl }) => purl)))
    .digest('hex');
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${serialHash.slice(0, 8)}-${serialHash.slice(8, 12)}-4${serialHash.slice(13, 16)}-a${serialHash.slice(17, 20)}-${serialHash.slice(20, 32)}`,
    version: 1,
    metadata: {
      component: { type: 'application', name: 'rock-star', version: lock.packages?.['']?.version || '0.0.0' },
      properties: [{ name: 'rockstaros:scope', value: 'npm package-lock inventory; native Buildroot inventory remains separate' }],
    },
    components,
  };
  const destination = resolve(root, outputPath);
  if (!inside(root, outputPath)) fail('SBOM出力先はrepository内の相対pathにしてください');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(sbom, null, 2)}\n`);
  return { destination, count: components.length };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
