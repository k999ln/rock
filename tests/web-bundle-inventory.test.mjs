import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createPackageLockModuleResolver,
  createWebBundleInventoryPlugin,
  packageLockPathForModule,
  summarizeWebBundleLicenseAudit,
} from '../scripts/web-bundle-inventory.mjs';

const lock = {
  packages: {
    'node_modules/plain': { version: '1.2.3', license: 'MIT' },
    'node_modules/@scope/pkg': { version: '4.5.6', license: 'MPL-2.0' },
    'node_modules/plain/node_modules/nested': {
      version: '7.8.9',
      license: 'Apache-2.0',
    },
  },
};

const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'web-bundle-inventory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const put = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
};
const pkg = (directory, name, version, license = 'MIT') => {
  put(
    resolve(directory, 'package.json'),
    JSON.stringify({ name, version, license }),
  );
  put(resolve(directory, 'index.js'), 'export const bundled = true;\n');
  return resolve(directory, 'index.js');
};
const link = (target, path) => {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, 'dir');
};

void test('exact installed flat, scoped, nested and wrapped module IDs resolve', (t) => {
  const root = fixture(t);
  const plain = pkg(resolve(root, 'node_modules/plain'), 'plain', '1.2.3');
  const scoped = pkg(
    resolve(root, 'node_modules/@scope/pkg'),
    '@scope/pkg',
    '4.5.6',
    'MPL-2.0',
  );
  const nested = pkg(
    resolve(root, 'node_modules/plain/node_modules/nested'),
    'nested',
    '7.8.9',
    'Apache-2.0',
  );
  for (const [id, expected] of [
    [plain + '?x#fragment', 'node_modules/plain'],
    ['\0' + scoped + '?commonjs-proxy', 'node_modules/@scope/pkg'],
    [pathToFileURL(scoped).href, 'node_modules/@scope/pkg'],
    [nested, 'node_modules/plain/node_modules/nested'],
  ]) {
    assert.equal(
      packageLockPathForModule({ root, moduleId: id, lock }),
      expected,
    );
  }
  assert.equal(
    packageLockPathForModule({ root, moduleId: '/outside/pkg.js', lock }),
    null,
  );
  assert.equal(
    packageLockPathForModule({ root, moduleId: '\0virtual:' + plain, lock }),
    null,
  );
});

void test('package-level and whole node_modules symlinks use exact physical roots', (t) => {
  const root = fixture(t),
    shared = fixture(t);
  const physical = pkg(
    resolve(shared, '@scope/pkg'),
    '@scope/pkg',
    '4.5.6',
    'MPL-2.0',
  );
  link(resolve(shared, '@scope/pkg'), resolve(root, 'node_modules/@scope/pkg'));
  assert.equal(
    packageLockPathForModule({ root, moduleId: physical, lock }),
    'node_modules/@scope/pkg',
  );
  const wholeRoot = fixture(t);
  link(shared, resolve(wholeRoot, 'node_modules'));
  assert.equal(
    packageLockPathForModule({ root: wholeRoot, moduleId: physical, lock }),
    'node_modules/@scope/pkg',
  );
  const explicitRoot = fixture(t);
  assert.equal(
    packageLockPathForModule({
      root: explicitRoot,
      moduleId: physical,
      lock,
      nodeModulesRoot: shared,
    }),
    'node_modules/@scope/pkg',
  );
});

void test('same-name versions resolve independently; a lock-missing nested package never falls back to parent', (t) => {
  const root = fixture(t),
    shared = fixture(t);
  const flat = pkg(resolve(shared, 'ipaddr.js'), 'ipaddr.js', '1.9.1');
  pkg(resolve(shared, 'vinext'), 'vinext', '1.0.0');
  const nested = pkg(
    resolve(shared, 'vinext/node_modules/ipaddr.js'),
    'ipaddr.js',
    '2.5.0',
  );
  link(resolve(shared, 'ipaddr.js'), resolve(root, 'node_modules/ipaddr.js'));
  link(resolve(shared, 'vinext'), resolve(root, 'node_modules/vinext'));
  const lock = {
    packages: {
      'node_modules/ipaddr.js': { version: '1.9.1', license: 'MIT' },
      'node_modules/vinext': { version: '1.0.0', license: 'MIT' },
      'node_modules/vinext/node_modules/ipaddr.js': {
        version: '2.5.0',
        license: 'MIT',
      },
    },
  };
  const resolver = createPackageLockModuleResolver({ root, lock });
  assert.equal(resolver(flat).component.version, '1.9.1');
  assert.equal(
    resolver(nested).lockPath,
    'node_modules/vinext/node_modules/ipaddr.js',
  );
  assert.equal(resolver(nested).component.version, '2.5.0');
  delete lock.packages['node_modules/vinext/node_modules/ipaddr.js'];
  assert.equal(
    packageLockPathForModule({ root, moduleId: nested, lock }),
    null,
  );
  rmSync(resolve(shared, 'vinext/node_modules/ipaddr.js/package.json'));
  assert.equal(
    createPackageLockModuleResolver({ root, lock })(nested).reason,
    'untracked-nested-package',
  );
});

void test('installed name/version mismatches, missing metadata and malformed manifests fail closed', (t) => {
  for (const [installed, entry, reason] of [
    [
      { name: 'other', version: '1.0', license: 'MIT' },
      { version: '1.0', license: 'MIT' },
      'installed-lock-identity-mismatch',
    ],
    [
      { name: 'plain', version: '2.0', license: 'MIT' },
      { version: '1.0', license: 'MIT' },
      'installed-lock-identity-mismatch',
    ],
    [
      { name: 'plain', license: 'MIT' },
      { version: '1.0', license: 'MIT' },
      'installed-lock-identity-mismatch',
    ],
    [
      { name: 'plain', version: '1.0' },
      { version: '1.0', license: 'MIT' },
      'license-metadata-missing',
    ],
    [
      { name: 'plain', version: '1.0', license: 'MIT' },
      { version: '1.0' },
      'license-metadata-missing',
    ],
    [
      { name: 'plain', version: '1.0', license: 'ISC' },
      { version: '1.0', license: 'MIT' },
      'installed-lock-license-mismatch',
    ],
  ]) {
    const root = fixture(t),
      dir = resolve(root, 'node_modules/plain'),
      id = pkg(dir, 'plain', '1.0');
    put(resolve(dir, 'package.json'), JSON.stringify(installed));
    const result = createPackageLockModuleResolver({
      root,
      lock: { packages: { 'node_modules/plain': entry } },
    })(id);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.reason, reason);
  }
  const root = fixture(t),
    id = pkg(resolve(root, 'node_modules/plain'), 'plain', '1.2.3');
  put(resolve(root, 'node_modules/plain/package.json'), '{bad json');
  assert.equal(
    createPackageLockModuleResolver({ root, lock })(id).reason,
    'invalid-package-manifest',
  );
});

void test('unlinked same-name/version outsiders and multiple lock aliases of one real package are rejected', (t) => {
  const root = fixture(t),
    outside = fixture(t);
  pkg(resolve(root, 'node_modules/plain'), 'plain', '1.2.3');
  const id = pkg(resolve(outside, 'node_modules/plain'), 'plain', '1.2.3');
  assert.equal(packageLockPathForModule({ root, moduleId: id, lock }), null);
  const aliased = resolve(root, 'node_modules/plain');
  link(aliased, resolve(root, 'node_modules/alias'));
  const ambiguous = structuredClone(lock);
  ambiguous.packages['node_modules/alias'] = {
    name: 'plain',
    version: '1.2.3',
    license: 'MIT',
  };
  assert.equal(
    createPackageLockModuleResolver({ root, lock: ambiguous })(
      resolve(aliased, 'index.js'),
    ).reason,
    'ambiguous-physical-package',
  );
});

void test('type-only subfolder manifests preserve package identity; changes after indexing are rejected', (t) => {
  const root = fixture(t),
    dir = resolve(root, 'node_modules/plain');
  pkg(dir, 'plain', '1.2.3');
  const id = resolve(dir, 'dist/esm/index.js');
  put(id, 'export default 1;');
  put(resolve(dir, 'dist/esm/package.json'), '{}');
  assert.equal(
    packageLockPathForModule({ root, moduleId: id, lock }),
    'node_modules/plain',
  );
  const resolver = createPackageLockModuleResolver({ root, lock });
  pkg(dir, 'plain', '9.9.9');
  assert.equal(resolver(id).reason, 'package-changed-during-build');
});

void test('generated inventory records module bytes, installed manifest, exact lock path and chunk membership', (t) => {
  const root = fixture(t),
    id = pkg(resolve(root, 'node_modules/plain'), 'plain', '1.2.3');
  put(resolve(root, 'package-lock.json'), JSON.stringify(lock));
  const unknown = pkg(
    resolve(root, 'node_modules/untracked'),
    'untracked',
    '1.0.0',
  );
  const plugin = createWebBundleInventoryPlugin({ root });
  plugin.buildStart();
  plugin.generateBundle.call(
    { environment: { name: 'client' } },
    {},
    {
      one: {
        type: 'chunk',
        fileName: 'one.js',
        modules: { [id]: {}, [unknown]: {} },
      },
    },
  );
  const report = JSON.parse(
    readFileSync(
      resolve(root, 'work/release/web-bundle-components.json'),
      'utf8',
    ),
  );
  assert.deepEqual(report.environments.client.unresolvedNodeModules, [
    'untracked',
  ]);
  const resolved = report.environments.client.moduleEvidence.find(
    (x) => x.status === 'resolved',
  );
  assert.equal(resolved.lockPath, 'node_modules/plain');
  assert.deepEqual(resolved.chunks, ['one.js']);
  assert.equal(
    resolved.moduleSha256,
    createHash('sha256').update(readFileSync(id)).digest('hex'),
  );
  assert.equal(
    resolved.packageJsonSha256,
    createHash('sha256')
      .update(readFileSync(resolve(root, 'node_modules/plain/package.json')))
      .digest('hex'),
  );
  assert.equal(
    resolved.lockEntrySha256,
    createHash('sha256')
      .update(JSON.stringify(lock.packages['node_modules/plain']))
      .digest('hex'),
  );
});

void test('bundle license audit reports exact Vite components without claiming legal clearance', () => {
  const packageLockBytes = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`);
  const component = {
    purl: 'pkg:npm/%40scope%2Fpkg@4.5.6',
    name: '@scope/pkg',
    version: '4.5.6',
    license: 'MPL-2.0',
  };
  const inventory = {
    schema: 'rockstaros-web-bundle-inventory/1',
    scope: 'VITE_REPORTED_BUNDLED_MODULES_NOT_LEGAL_CLEARANCE',
    packageLockSha256: createHash('sha256')
      .update(packageLockBytes)
      .digest('hex'),
    environments: Object.fromEntries(
      ['client', 'rsc', 'ssr'].map((name) => [
        name,
        {
          chunks: [`${name}.js`],
          localModules: 1,
          components: [component],
          unresolvedNodeModules: [],
        },
      ]),
    ),
  };
  const result = summarizeWebBundleLicenseAudit({
    inventory,
    packageLockBytes,
    licenseAudit: {
      reviewComponents: [
        { purl: component.purl, reviewClass: 'reciprocal-source-terms-review' },
      ],
    },
  });
  assert.equal(result.bundledComponents, 1);
  assert.equal(result.reviewRequiredInBundle, 1);
  assert.equal(
    result.reviewComponents[0].reviewClass,
    'reciprocal-source-terms-review',
  );
  assert.match(result.boundary, /does not replace/);

  const unresolved = structuredClone(inventory);
  unresolved.environments.client.unresolvedNodeModules = ['unknown'];
  assert.throws(
    () =>
      summarizeWebBundleLicenseAudit({
        inventory: unresolved,
        packageLockBytes,
        licenseAudit: {},
      }),
    /未解決module/,
  );
  const stale = structuredClone(inventory);
  stale.packageLockSha256 = '0'.repeat(64);
  assert.throws(
    () =>
      summarizeWebBundleLicenseAudit({
        inventory: stale,
        packageLockBytes,
        licenseAudit: {},
      }),
    /package-lock hashが不一致/,
  );
  const forged = structuredClone(inventory);
  forged.environments.client.components[0].version = '9.9.9';
  assert.throws(
    () =>
      summarizeWebBundleLicenseAudit({
        inventory: forged,
        packageLockBytes,
        licenseAudit: {},
      }),
    /bundle metadataがpackage-lockと不一致/,
  );
});
