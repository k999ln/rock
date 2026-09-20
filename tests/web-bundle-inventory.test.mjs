import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  packageLockPathForModule,
  summarizeWebBundleLicenseAudit,
} from '../scripts/web-bundle-inventory.mjs';

const root = '/workspace/rock';
const lock = {
  packages: {
    'node_modules/plain': { version: '1.2.3', license: 'MIT' },
    'node_modules/@scope/pkg': { version: '4.5.6', license: 'MPL-2.0' },
    'node_modules/plain/node_modules/nested': { version: '7.8.9', license: 'Apache-2.0' },
  },
};

void test('bundle module IDs resolve to exact flat, scoped, and nested package-lock paths', () => {
  assert.equal(
    packageLockPathForModule({ root, moduleId: `${root}/node_modules/plain/index.js?x`, lock }),
    'node_modules/plain',
  );
  assert.equal(
    packageLockPathForModule({ root, moduleId: `${root}/node_modules/@scope/pkg/main.js`, lock }),
    'node_modules/@scope/pkg',
  );
  assert.equal(
    packageLockPathForModule({
      root,
      moduleId: `${root}/node_modules/plain/node_modules/nested/index.js`,
      lock,
    }),
    'node_modules/plain/node_modules/nested',
  );
  assert.equal(packageLockPathForModule({ root, moduleId: '/outside/pkg.js', lock }), null);
  assert.equal(
    packageLockPathForModule({
      root,
      moduleId: '/shared/dependencies/node_modules/@scope/pkg/main.js',
      lock,
      nodeModulesRoot: '/shared/dependencies/node_modules',
    }),
    'node_modules/@scope/pkg',
  );
  assert.equal(
    packageLockPathForModule({
      root,
      moduleId: '/outside/pkg.js',
      lock,
      nodeModulesRoot: '/shared/dependencies/node_modules',
    }),
    null,
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
    packageLockSha256: createHash('sha256').update(packageLockBytes).digest('hex'),
    environments: Object.fromEntries(
      ['client', 'rsc', 'ssr'].map((name) => [
        name,
        { chunks: [`${name}.js`], localModules: 1, components: [component], unresolvedNodeModules: [] },
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
  assert.equal(result.reviewComponents[0].reviewClass, 'reciprocal-source-terms-review');
  assert.match(result.boundary, /does not replace/);

  const unresolved = structuredClone(inventory);
  unresolved.environments.client.unresolvedNodeModules = ['unknown'];
  assert.throws(
    () => summarizeWebBundleLicenseAudit({ inventory: unresolved, packageLockBytes, licenseAudit: {} }),
    /未解決module/,
  );
  const stale = structuredClone(inventory);
  stale.packageLockSha256 = '0'.repeat(64);
  assert.throws(
    () => summarizeWebBundleLicenseAudit({ inventory: stale, packageLockBytes, licenseAudit: {} }),
    /package-lock hashが不一致/,
  );
  const forged = structuredClone(inventory);
  forged.environments.client.components[0].version = '9.9.9';
  assert.throws(
    () => summarizeWebBundleLicenseAudit({ inventory: forged, packageLockBytes, licenseAudit: {} }),
    /bundle metadataがpackage-lockと不一致/,
  );
});
