import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { z } from 'zod';
import { z as z3 } from 'zod/v3';
import { zodSchema } from '@ai-sdk/provider-utils';
import { rawConfigSchema, registryItemSchema } from 'shadcn/schema';

const require = createRequire(import.meta.url);
const semver = require('semver');
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

for (const prefix of ['', 'sites/avocado-mini/']) {
  void test(`${prefix || 'root'}: every locked and installed Zod consumer uses a patched 4.x`, () => {
    const manifest = read(`${prefix}package.json`);
    const lock = read(`${prefix}package-lock.json`);
    for (const version of ['4.6.6', '4.6.7', '4.6.8']) assert.ok(semver.satisfies(version, manifest.overrides.zod));
    for (const version of ['3.25.76', '4.4.3', '4.6.5', '5.0.0']) assert.equal(semver.satisfies(version, manifest.overrides.zod), false);
    const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith('node_modules/zod'));
    assert.ok(copies.length > 0);
    for (const [path, entry] of copies) {
      assert.ok(semver.satisfies(entry.version, '>=4.6.6 <5'), path);
      assert.ok(entry.integrity.startsWith('sha512-'));
    }
    const consumers = Object.entries(lock.packages).filter(([, entry]) => entry.dependencies?.zod || entry.peerDependencies?.zod);
    assert.ok(consumers.length > 0);
    for (const [path, entry] of consumers) {
      const consumer = createRequire(new URL(`../${prefix}${path}/package.json`, import.meta.url));
      const version = consumer('zod/package.json').version;
      assert.ok(semver.satisfies(version, '>=4.6.6 <5'), path);
      // Cloudflare pins 4.4.3; this single same-major override is exercised by the Worker suite.
      if (path !== 'node_modules/@cloudflare/vitest-plugin') {
        assert.ok(semver.satisfies(version, entry.dependencies?.zod ?? entry.peerDependencies.zod), `${path} declared compatibility`);
      }
    }
  });
}

void test('oversized bounded collections reject before walking elements, synchronously and asynchronously', async () => {
  const mini = createRequire(new URL('../sites/avocado-mini/package.json', import.meta.url))('zod').z;
  for (const api of [z, mini]) {
    let visits = 0;
    const element = api.unknown().transform(() => { visits++; return 'checked'; });
    const cases = [
      [() => api.array(element).max(2), [1, 2, 3]],
      [() => api.array(element).length(2), [1, 2, 3]],
      [() => api.set(element).max(2), new Set([1, 2, 3])],
      [() => api.map(element, element).max(2), new Map([[1, 1], [2, 2], [3, 3]])],
    ];
    for (const [makeSchema, input] of cases) {
      const schema = makeSchema();
      for (const result of [schema.safeParse(input), await schema.safeParseAsync(input)]) {
        assert.equal(result.success, false);
        assert.deepEqual(result.error.issues.map((issue) => issue.code), ['too_big']);
        assert.equal(visits, 0, 'oversized input must not execute element validators');
      }
    }
    assert.equal(visits, 0);
    assert.deepEqual(api.array(element).max(2).parse([1, 2]), ['checked', 'checked']);
    assert.equal(visits, 2);
  }
});

void test('upstream shadcn Zod 4 migration preserves project config and registry contracts', () => {
  const config = read('components.json');
  const parsed = rawConfigSchema.parse(config);
  assert.equal(parsed.style, config.style);
  assert.deepEqual(parsed.aliases, config.aliases);
  const item = { name: 'fixture', type: 'registry:ui', files: [{ path: 'ui/fixture.tsx', type: 'registry:ui', content: 'export {}' }] };
  assert.deepEqual(registryItemSchema.parse(item), item);
  assert.equal(registryItemSchema.safeParse({ ...item, type: 'invalid' }).success, false);
});

void test('AI SDK schema adapter keeps both supported Zod APIs without invoking a model', async () => {
  for (const api of [z3, z]) {
    const schema = zodSchema(api.object({ name: api.string(), count: api.number().int().min(0) }));
    const json = await schema.jsonSchema;
    assert.equal(json.type, 'object');
    assert.equal(json.properties.name.type, 'string');
    assert.equal((await schema.validate({ name: 'fixture', count: 1 })).success, true);
    assert.equal((await schema.validate({ name: 'fixture', count: -1 })).success, false);
  }
});
