import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const cleanModuleId = (id) => {
  let cleaned = id;
  while (cleaned.charCodeAt(0) === 0) cleaned = cleaned.slice(1);
  cleaned = cleaned.split('?')[0].split('#')[0];
  if (cleaned.startsWith('file:')) {
    try {
      return fileURLToPath(cleaned);
    } catch {
      return '';
    }
  }
  return cleaned;
};

const unresolvedPackageName = (id) => {
  const suffix =
    cleanModuleId(id).split(`${sep}node_modules${sep}`).at(-1) || '';
  const segments = suffix.split(sep);
  return segments[0]?.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];
};

const within = (parent, child) => {
  const path = relative(parent, child);
  return (
    path === '' ||
    (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
  );
};

// Index exact installed roots from lock paths, not package names. Package-level
// symlinks and nested versions can point outside the build's node_modules root.
export function createPackageLockModuleResolver({
  root,
  lock,
  nodeModulesRoot = resolve(root, 'node_modules'),
}) {
  root = resolve(root);
  const packagesByRealRoot = new Map();
  for (const [lockPath, entry] of Object.entries(lock.packages || {})) {
    if (!lockPath || !entry?.version || !within(root, resolve(root, lockPath)))
      continue;
    const installedRoot = lockPath.startsWith('node_modules/')
      ? resolve(nodeModulesRoot, lockPath.slice('node_modules/'.length))
      : resolve(root, lockPath);
    try {
      const realPackageRoot = realpathSync(installedRoot);
      const packageJsonBytes = readFileSync(
        resolve(realPackageRoot, 'package.json'),
      );
      const installed = JSON.parse(packageJsonBytes);
      const record = {
        lockPath,
        entry,
        installed,
        packageJsonSha256: sha256(packageJsonBytes),
      };
      const records = packagesByRealRoot.get(realPackageRoot) || [];
      records.push(record);
      packagesByRealRoot.set(realPackageRoot, records);
    } catch {
      // Optional/platform packages may not be installed. A bundled file without
      // a verified installed record remains unresolved, never guessed by name.
    }
  }
  const cache = new Map();
  return (moduleId) => {
    if (cache.has(moduleId)) return cache.get(moduleId);
    const cleaned = cleanModuleId(moduleId);
    const evidence = { moduleId, cleanedModuleId: cleaned };
    const finish = (status, extra = {}) => {
      const result = { status, ...evidence, ...extra };
      cache.set(moduleId, result);
      return result;
    };
    const dependencyId = cleaned.includes(`${sep}node_modules${sep}`);
    if (!isAbsolute(cleaned))
      return finish(dependencyId ? 'unresolved' : 'local', {
        reason: 'non-file-module-id',
      });
    try {
      if (!statSync(cleaned).isFile()) throw new Error('not a file');
      evidence.realModulePath = realpathSync(cleaned);
      evidence.moduleSha256 = sha256(readFileSync(evidence.realModulePath));
    } catch {
      return finish(
        dependencyId || !within(root, cleaned) ? 'unresolved' : 'local',
        { reason: 'module-file-unavailable' },
      );
    }
    let packageRoot = dirname(evidence.realModulePath);
    while (true) {
      const manifestPath = resolve(packageRoot, 'package.json');
      if (existsSync(manifestPath)) {
        let installed, bytes;
        try {
          bytes = readFileSync(manifestPath);
          installed = JSON.parse(bytes);
        } catch {
          return finish('unresolved', {
            reason: 'invalid-package-manifest',
            realPackageRoot: packageRoot,
          });
        }
        // A type-only manifest in dist/esm is not a separate npm package.
        if (
          installed.name ||
          installed.version ||
          packagesByRealRoot.has(packageRoot)
        ) {
          evidence.realPackageRoot = packageRoot;
          evidence.packageJsonSha256 = sha256(bytes);
          evidence.installedName = installed.name || null;
          evidence.installedVersion = installed.version || null;
          evidence.installedLicense = installed.license || null;
          const records = packagesByRealRoot.get(packageRoot) || [];
          if (!records.length)
            return finish(
              dependencyId || !within(root, cleaned) ? 'unresolved' : 'local',
              { reason: 'package-root-not-in-lock' },
            );
          if (
            relative(packageRoot, evidence.realModulePath)
              .split(sep)
              .includes('node_modules')
          ) {
            return finish('unresolved', { reason: 'untracked-nested-package' });
          }
          if (records.length !== 1)
            return finish('unresolved', {
              reason: 'ambiguous-physical-package',
              candidateLockPaths: records.map((r) => r.lockPath).sort(),
            });
          const { lockPath, entry, packageJsonSha256 } = records[0];
          evidence.lockPath = lockPath;
          evidence.lockEntrySha256 = sha256(JSON.stringify(entry));
          if (evidence.packageJsonSha256 !== packageJsonSha256)
            return finish('unresolved', {
              reason: 'package-changed-during-build',
            });
          const name = entry.name || lockPath.split('node_modules/').at(-1);
          if (installed.name !== name || installed.version !== entry.version)
            return finish('unresolved', {
              reason: 'installed-lock-identity-mismatch',
            });
          if (
            typeof entry.license !== 'string' ||
            !entry.license ||
            typeof installed.license !== 'string' ||
            !installed.license
          )
            return finish('unresolved', { reason: 'license-metadata-missing' });
          if (entry.license !== installed.license)
            return finish('unresolved', {
              reason: 'installed-lock-license-mismatch',
            });
          return finish('resolved', {
            component: {
              purl: `pkg:npm/${encodeURIComponent(name)}@${entry.version}`,
              name,
              version: entry.version,
              license: entry.license,
            },
          });
        }
      }
      const parent = dirname(packageRoot);
      if (parent === packageRoot)
        return finish(
          dependencyId || !within(root, cleaned) ? 'unresolved' : 'local',
          { reason: 'package-manifest-unavailable' },
        );
      packageRoot = parent;
    }
  };
}

export function packageLockPathForModule(options) {
  const result = createPackageLockModuleResolver(options)(options.moduleId);
  return result.status === 'resolved' ? result.lockPath : null;
}

const sorted = (values) =>
  [...values].sort((left, right) => left.localeCompare(right));

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
          moduleEvidence: [...environment.moduleEvidence.values()]
            .map(({ chunks, ...evidence }) => ({
              ...evidence,
              chunks: sorted(chunks),
            }))
            .sort((a, b) => a.moduleId.localeCompare(b.moduleId)),
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
  const nodeModulesRoot = realpathSync(resolve(root, 'node_modules'));
  const resolveModule = createPackageLockModuleResolver({
    root,
    lock,
    nodeModulesRoot,
  });
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
        moduleEvidence: new Map(),
      };
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        environment.chunks.add(output.fileName);
        for (const moduleId of Object.keys(output.modules || {})) {
          const resolution = resolveModule(moduleId);
          if (resolution.status !== 'local') {
            const evidence = environment.moduleEvidence.get(moduleId) || {
              ...resolution,
              chunks: new Set(),
            };
            evidence.chunks.add(output.fileName);
            environment.moduleEvidence.set(moduleId, evidence);
          }
          if (resolution.status === 'resolved') {
            const { component } = resolution;
            environment.components.set(component.purl, component);
          } else if (resolution.status === 'unresolved') {
            environment.unresolvedNodeModules.add(
              resolution.installedName ||
                unresolvedPackageName(moduleId) ||
                moduleId,
            );
          } else {
            environment.localModules.add(cleanModuleId(moduleId));
          }
        }
      }
      state.set(name, environment);
      const report = serialize({ state, packageLockSha256 });
      mkdirSync(dirname(outputPath), { recursive: true });
      const temporaryPath = `${outputPath}.${process.pid}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
      });
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
