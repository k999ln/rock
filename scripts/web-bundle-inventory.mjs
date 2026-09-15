import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const cleanModuleId = (id) => {
  let cleaned = id;
  while (cleaned.charCodeAt(0) === 0) cleaned = cleaned.slice(1);
  return cleaned.split('?')[0].split('#')[0];
};

const unresolvedPackageName = (id) => {
  const suffix = cleanModuleId(id).split(`${sep}node_modules${sep}`).at(-1) || '';
  const segments = suffix.split(sep);
  return segments[0]?.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
};

export function packageLockPathForModule({ root, moduleId, lock }) {
  const cleaned = cleanModuleId(moduleId);
  const relativePath = relative(root, cleaned).split(sep).join('/');
  if (!relativePath || relativePath.startsWith('../') || relativePath === '..') return null;
  const segments = relativePath.split('/');
  let match = null;
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] !== 'node_modules') continue;
    const scoped = segments[index + 1]?.startsWith('@');
    const length = scoped ? index + 3 : index + 2;
    const candidate = segments.slice(0, length).join('/');
    if (lock.packages?.[candidate]?.version) match = candidate;
  }
  return match;
}

const componentForModule = ({ root, moduleId, lock }) => {
  const path = packageLockPathForModule({ root, moduleId, lock });
  if (!path) return null;
  const entry = lock.packages[path];
  const name = entry.name || path.split('node_modules/').at(-1);
  return {
    purl: `pkg:npm/${encodeURIComponent(name)}@${entry.version}`,
    name,
    version: entry.version,
    license: entry.license || null,
  };
};

const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));

const serialize = ({ state, packageLockSha256 }) => ({
  schema: 'rockstaros-web-bundle-inventory/1',
  scope: 'VITE_REPORTED_BUNDLED_MODULES_NOT_LEGAL_CLEARANCE',
  packageLockSha256,
  environments: Object.fromEntries(
    [...state.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, environment]) => [
        name,
        {
          chunks: sorted(environment.chunks),
          localModules: environment.localModules.size,
          components: [...environment.components.values()].sort((left, right) =>
            left.purl.localeCompare(right.purl),
          ),
          unresolvedNodeModules: sorted(environment.unresolvedNodeModules),
        },
      ]),
  ),
});

export function createWebBundleInventoryPlugin({
  root = process.cwd(),
  outputPath = resolve(root, 'work/release/web-bundle-components.json'),
} = {}) {
  const lockBytes = readFileSync(resolve(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const packageLockSha256 = sha256(lockBytes);
  const state = new Map();
  let initialized = false;

  return {
    name: 'rockstaros-web-bundle-inventory',
    apply: 'build',
    buildStart() {
      if (initialized) return;
      initialized = true;
      rmSync(outputPath, { force: true });
    },
    generateBundle(_options, bundle) {
      const name = this.environment?.name || 'unknown';
      const environment = state.get(name) || {
        chunks: new Set(),
        localModules: new Set(),
        components: new Map(),
        unresolvedNodeModules: new Set(),
      };
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        environment.chunks.add(output.fileName);
        for (const moduleId of Object.keys(output.modules || {})) {
          const component = componentForModule({ root, moduleId, lock });
          if (component) {
            environment.components.set(component.purl, component);
          } else if (cleanModuleId(moduleId).includes(`${sep}node_modules${sep}`)) {
            environment.unresolvedNodeModules.add(unresolvedPackageName(moduleId));
          } else {
            environment.localModules.add(cleanModuleId(moduleId));
          }
        }
      }
      state.set(name, environment);
      const report = serialize({ state, packageLockSha256 });
      mkdirSync(dirname(outputPath), { recursive: true });
      const temporaryPath = `${outputPath}.${process.pid}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporaryPath, outputPath);
    },
  };
}

export function summarizeWebBundleLicenseAudit({ inventory, packageLockBytes, licenseAudit }) {
  if (inventory?.schema !== 'rockstaros-web-bundle-inventory/1') {
    throw new Error('Web bundle inventory schemaが不一致です');
  }
  if (inventory.scope !== 'VITE_REPORTED_BUNDLED_MODULES_NOT_LEGAL_CLEARANCE') {
    throw new Error('Web bundle inventory scopeが不一致です');
  }
  const expectedLockSha = sha256(packageLockBytes);
  if (inventory.packageLockSha256 !== expectedLockSha) {
    throw new Error('Web bundle inventoryとpackage-lock hashが不一致です');
  }
  const lock = JSON.parse(packageLockBytes);
  const lockComponents = new Map();
  for (const [path, entry] of Object.entries(lock.packages || {})) {
    if (!path || !entry?.version) continue;
    const name = entry.name || path.split('node_modules/').at(-1);
    const component = {
      purl: `pkg:npm/${encodeURIComponent(name)}@${entry.version}`,
      name,
      version: entry.version,
      license: entry.license || null,
    };
    const previous = lockComponents.get(component.purl);
    if (previous && JSON.stringify(previous) !== JSON.stringify(component)) {
      throw new Error(`${component.purl}のpackage-lock metadataが競合しています`);
    }
    lockComponents.set(component.purl, component);
  }
  const components = new Map();
  for (const [environmentName, environment] of Object.entries(inventory.environments || {})) {
    if (
      !Array.isArray(environment.chunks) ||
      environment.chunks.length < 1 ||
      !Number.isInteger(environment.localModules) ||
      environment.localModules < 1 ||
      !Array.isArray(environment.components) ||
      environment.components.length < 1 ||
      !Array.isArray(environment.unresolvedNodeModules)
    ) {
      throw new Error(`Web bundle inventory ${environmentName}が不完全です`);
    }
    if (environment.unresolvedNodeModules.length) {
      throw new Error(`Web bundle inventory ${environmentName}に未解決moduleがあります`);
    }
    const environmentPurls = new Set();
    for (const component of environment.components) {
      if (!component.license) throw new Error(`${component.purl}のlicense metadataがありません`);
      if (environmentPurls.has(component.purl)) {
        throw new Error(`${component.purl}が${environmentName}で重複しています`);
      }
      environmentPurls.add(component.purl);
      if (JSON.stringify(lockComponents.get(component.purl)) !== JSON.stringify(component)) {
        throw new Error(`${component.purl}のbundle metadataがpackage-lockと不一致です`);
      }
      const previous = components.get(component.purl);
      if (previous && JSON.stringify(previous) !== JSON.stringify(component)) {
        throw new Error(`${component.purl}のbundle metadataが競合しています`);
      }
      components.set(component.purl, component);
    }
  }
  const expectedEnvironments = ['client', 'rsc', 'ssr'];
  if (
    JSON.stringify(Object.keys(inventory.environments || {}).sort()) !==
    JSON.stringify(expectedEnvironments)
  ) {
    throw new Error('Web bundle environment集合が不一致です');
  }
  const reviewByPurl = new Map(
    (licenseAudit.reviewComponents || []).map((component) => [component.purl, component]),
  );
  const reviewComponents = [...components.values()]
    .filter((component) => reviewByPurl.has(component.purl))
    .map((component) => ({
      ...component,
      reviewClass: reviewByPurl.get(component.purl).reviewClass,
    }))
    .sort((left, right) => left.purl.localeCompare(right.purl));
  return {
    schema: 'rockstaros-web-bundle-license-audit/1',
    scope: 'VITE_REPORTED_BUNDLED_MODULES_NOT_LEGAL_CLEARANCE',
    packageLockSha256: inventory.packageLockSha256,
    environments: expectedEnvironments,
    bundledComponents: components.size,
    reviewRequiredInBundle: reviewComponents.length,
    reviewComponents,
    boundary:
      'Vite reported these modules in generated chunks. This does not replace license texts, notices, source-offer obligations, product-license approval, or legal clearance.',
  };
}
